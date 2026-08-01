import { redirect } from "next/navigation";
import {
  getEstimateHeaderById,
  getEstimateMeta,
  getEstimateItems,
  getEstimateCategories,
  getEstimateSummaryFromRecords,
  getCostCodes,
  getPaymentSchedule,
  listPaymentTemplates,
} from "@/lib/data";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { EstimateDetailClient } from "./estimate-detail-client";
import { EstimateSuccessBanner } from "./estimate-success-banner";

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
  projectName?: string | null
): Promise<InvoiceProjectLinkStatus> {
  const db = getServerSupabaseAdmin();
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
  invoiceIds: string[]
): Promise<Record<string, PaymentInvoiceSummary>> {
  const ids = Array.from(new Set(invoiceIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return {};
  const db = getServerSupabaseAdmin();
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
  const { id } = await params;
  /** When the dynamic segment incorrectly receives `new`, avoid UUID queries and send the canonical route. */
  if (id === "new") redirect("/estimates/new");
  const { created, saved } = await searchParams;
  const [estimate, meta, items, categories, costCodes, paymentSchedule, paymentTemplates] =
    await Promise.all([
      getEstimateHeaderById(id),
      getEstimateMeta(id),
      getEstimateItems(id),
      getEstimateCategories(id),
      getCostCodes(),
      getPaymentSchedule(id),
      listPaymentTemplates(),
    ]);

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
  const invoiceProjectLink =
    paymentSchedule.length > 0
      ? await getInvoiceProjectLinkStatus(id, meta.project.name)
      : undefined;
  const paymentInvoiceSummaries = await getPaymentInvoiceSummaries(
    paymentSchedule.map((item) => item.invoiceId ?? "")
  );

  return (
    <div className="estimate-builder-page page-stack py-3 md:py-4">
      <EstimateDetailClient
        estimateId={id}
        estimateNumber={estimate.number}
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
      />
      <EstimateSuccessBanner created={created} saved={saved} />
    </div>
  );
}
