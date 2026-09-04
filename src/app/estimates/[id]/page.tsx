import { redirect } from "next/navigation";
import {
  getEstimateHeaderById,
  getEstimateMeta,
  getEstimateItems,
  getEstimateCategories,
  getEstimateSummaryFromRecords,
  getCostCodes,
  getPaymentSchedule,
  getEstimateRevisionContext,
  listPaymentTemplates,
} from "@/lib/data";
import { createServerSupabaseClient, getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import { getEstimateActivityWithClient } from "@/lib/estimate-activity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EstimateDetailClient } from "./estimate-detail-client";
import { EstimateSuccessBanner } from "./estimate-success-banner";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { emitRscTiming } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";

type InvoiceProjectLinkStatus = {
  canCreateInvoice: boolean;
  message?: string;
};

type PaymentInvoiceSummary = {
  invoiceNo?: string | null;
  status?: string | null;
};

const PROJECT_LINK_REQUIRED_MESSAGE =
  "Invoice generation requires a linked project. Convert this estimate to a project, or edit details so the project name matches one existing project before creating milestone invoices.";

function uniqueProjectRows(rows: Array<{ id: string | null; name: string | null }> | null) {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string | null }> = [];
  for (const row of rows ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: row.name ?? null });
  }
  return out;
}

async function getInvoiceProjectLinkStatus(
  estimateId: string,
  projectName?: string | null,
  db?: SupabaseClient | null
): Promise<InvoiceProjectLinkStatus> {
  if (!db) {
    return {
      canCreateInvoice: false,
      message: "Invoice generation requires the server database connection.",
    };
  }

  const bySource = await db
    .from("projects")
    .select("id, name")
    .eq("source_estimate_id", estimateId);
  if (bySource.error) {
    return { canCreateInvoice: false, message: PROJECT_LINK_REQUIRED_MESSAGE };
  }
  const sourceMatches = uniqueProjectRows(bySource.data);
  if (sourceMatches.length === 1) return { canCreateInvoice: true };
  if (sourceMatches.length > 1) {
    return {
      canCreateInvoice: false,
      message:
        "Invoice generation is blocked because multiple projects are linked to this estimate.",
    };
  }

  const name = projectName?.trim();
  if (!name) return { canCreateInvoice: false, message: PROJECT_LINK_REQUIRED_MESSAGE };
  const byName = await db.from("projects").select("id, name").eq("name", name);
  if (byName.error) {
    return { canCreateInvoice: false, message: PROJECT_LINK_REQUIRED_MESSAGE };
  }
  const nameMatches = uniqueProjectRows(byName.data);
  if (nameMatches.length === 1) return { canCreateInvoice: true };
  return { canCreateInvoice: false, message: PROJECT_LINK_REQUIRED_MESSAGE };
}

async function getPaymentInvoiceSummaries(
  invoiceIds: string[],
  db?: SupabaseClient | null
): Promise<Record<string, PaymentInvoiceSummary>> {
  const ids = Array.from(new Set(invoiceIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return {};
  if (!db) return {};
  const { data, error } = await db.from("invoices").select("id, invoice_no, status").in("id", ids);
  if (error) return {};
  return Object.fromEntries(
    (data ?? []).map((row) => [
      String(row.id),
      {
        invoiceNo: row.invoice_no ?? null,
        status: row.status ?? null,
      },
    ])
  );
}

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
}) {
  const pageStartedAt = performance.now();
  const { id } = await params;
  /** When the dynamic segment incorrectly receives `new`, avoid UUID queries and send the canonical route. */
  if (id === "new") redirect("/estimates/new");
  const { created, saved } = await searchParams;
  const authStartedAt = performance.now();
  const readClient = await createServerSupabaseClient();
  const authDuration = performance.now() - authStartedAt;
  if (!readClient) redirect(`/login?next=${encodeURIComponent(`/estimates/${id}`)}`);
  const adminClient = getServerSupabaseAdminNoStore();
  const serverDataStartedAt = performance.now();
  const pageData = await Promise.all([
    getEstimateHeaderById(id, readClient),
    getEstimateMeta(id, readClient),
    getEstimateItems(id, readClient),
    getEstimateCategories(id, readClient),
    getCostCodes(),
    getPaymentSchedule(id, readClient),
    listPaymentTemplates(adminClient).catch(() => []),
    adminClient ? getEstimateRevisionContext(id, adminClient).catch(() => null) : null,
    adminClient ? getEstimateActivityWithClient(adminClient, id).catch(() => null) : null,
  ])
    .then((data) => ({ data }))
    .catch((error: unknown) => ({ error }));

  if ("error" in pageData) {
    logServerPageDataError(`estimates/${id}`, pageData.error);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(pageData.error, "estimate financial details")}
        backHref="/estimates"
        backLabel="Back to estimates"
      />
    );
  }

  const [
    estimate,
    meta,
    items,
    categories,
    costCodes,
    paymentSchedule,
    paymentTemplates,
    revisionContext,
    activityEvents,
  ] = pageData.data;

  if (!estimate || !meta) redirect("/estimates");
  const resolvedSummary = getEstimateSummaryFromRecords(meta, items);

  const categoryNames = categories.reduce<Record<string, string>>((acc, c) => {
    acc[c.costCode] = c.displayName;
    return acc;
  }, {});
  const estimateCategories = [...categories].sort((a, b) => {
    const orderDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
    return orderDiff || a.costCode.localeCompare(b.costCode);
  });
  const [invoiceProjectLink, paymentInvoiceSummaries] = await Promise.all([
    paymentSchedule.length > 0
      ? getInvoiceProjectLinkStatus(id, meta.project.name, adminClient)
      : Promise.resolve(undefined),
    getPaymentInvoiceSummaries(
      paymentSchedule.map((item) => item.invoiceId ?? ""),
      adminClient
    ),
  ]);
  const rscPreparedAt = performance.now();
  emitRscTiming("estimates/[id]", {
    authMs: authDuration,
    serverDataMs: rscPreparedAt - serverDataStartedAt,
    rscPrepareMs: 0,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <div className="estimate-builder-page page-stack py-3 md:py-4">
      <EstimateDetailClient
        estimateId={id}
        estimateNumber={estimate.number}
        customerId={estimate.customerId}
        revisionContext={revisionContext}
        estimateUpdatedAt={estimate.updatedAt}
        initialStatus={estimate.status}
        meta={meta}
        items={items}
        estimateCategories={estimateCategories}
        categoryNames={categoryNames}
        costCodes={costCodes}
        summary={resolvedSummary}
        paymentSchedule={paymentSchedule}
        paymentTemplates={paymentTemplates}
        invoiceProjectLink={invoiceProjectLink}
        paymentInvoiceSummaries={paymentInvoiceSummaries}
        activityEvents={activityEvents}
      />
      <EstimateSuccessBanner created={created} saved={saved} />
    </div>
  );
}
