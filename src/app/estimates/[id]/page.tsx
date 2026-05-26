import { redirect } from "next/navigation";
import {
  getEstimateById,
  getEstimateMeta,
  getEstimateItems,
  getEstimateCategories,
  getEstimateSummary,
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
  const [estimate, meta, items, categories, summary, costCodes, paymentSchedule, paymentTemplates] =
    await Promise.all([
      getEstimateById(id),
      getEstimateMeta(id),
      getEstimateItems(id),
      getEstimateCategories(id),
      getEstimateSummary(id),
      getCostCodes(),
      getPaymentSchedule(id),
      listPaymentTemplates(),
    ]);

  if (!estimate || !meta) redirect("/estimates");

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
        summary={summary}
        paymentSchedule={paymentSchedule}
        paymentTemplates={paymentTemplates}
        invoiceProjectLink={invoiceProjectLink}
      />
      <EstimateSuccessBanner created={created} saved={saved} />
    </div>
  );
}
