/**
 * Estimate module — Supabase only. Single source of truth for estimates.
 * Tables: estimates, estimate_meta, estimate_categories, estimate_items.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { generateCode } from "@/lib/estimate-cost-code-suggest";

// —— Types ——

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

export type EstimateListItem = {
  id: string;
  number: string;
  client: string;
  project: string;
  status: EstimateStatus;
  updatedAt: string;
  total: number;
  approvedAt?: string;
};

export type EstimateMetaRecord = {
  client: { name: string; phone: string; email: string; address: string };
  project: { name: string; siteAddress: string };
  tax: number;
  discount: number;
  overheadPct: number;
  profitPct: number;
  estimateDate: string | null;
  validUntil: string | null;
  notes: string | null;
  salesPerson: string | null;
};

export type EstimateCategoryRecord = { costCode: string; displayName: string; orderIndex: number };

export type EstimateItemRow = {
  id: string;
  estimateId: string;
  costCode: string;
  desc: string;
  qty: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  hideAmountOnPdf: boolean;
};

export type EstimateSummary = {
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  subtotal: number;
  tax: number;
  discount: number;
  markup: number;
  total: number;
};

export type EstimateSnapshotRecord = {
  snapshotId: string;
  estimateId: string;
  version: number;
  createdAt: string;
  statusAtSnapshot: string;
  meta: (EstimateMetaRecord & { categoryNames?: Record<string, string> }) | null;
  items: EstimateItemRow[];
  summary: EstimateSummary | null;
  frozenPayload: {
    items: Array<{ qty: number; unitCost: number; markupPct: number }>;
    overheadPct: number;
    profitPct: number;
  };
};

export type PaymentScheduleItem = {
  id: string;
  estimateId: string;
  sortOrder: number;
  title: string;
  description: string | null;
  amount: number;
  dueDate: string | null;
  status: "draft" | "invoiced" | "paid";
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentScheduleWriteInput = {
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
  status?: "draft" | "invoiced" | "paid";
  invoiceId?: string | null;
};

// —— Helpers ——

function client(explicitClient?: SupabaseClient | null) {
  if (explicitClient) return explicitClient;
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

/** Line total = qty * unitCost * (1 + markupPct) */
export function lineTotal(item: EstimateItemRow): number {
  return item.qty * item.unitCost * (1 + item.markupPct);
}

/** One section of the cost breakdown: items share the same category id (DB: estimate_items.cost_code). */
export type EstimateCategorySectionRow = {
  categoryId: string;
  title: string;
  rows: EstimateItemRow[];
  /** Sum of line totals (qty × unitCost × (1+markup)) for rows in this category */
  sectionTotal: number;
};

/**
 * Group line items by category id (cost_code). Does not use array index or display name for matching.
 * Order: persisted estimate_categories (by orderIndex, then costCode), then item codes not in that set (sorted).
 */
export function groupEstimateItemsByCategoryId(
  items: EstimateItemRow[],
  categories: ReadonlyArray<{ costCode: string; displayName: string; orderIndex?: number }>,
  catalogNameByCode?: Readonly<Record<string, string>>
): EstimateCategorySectionRow[] {
  const byId = new Map<string, EstimateItemRow[]>();
  for (const item of items) {
    const id = item.costCode;
    let list = byId.get(id);
    if (!list) {
      list = [];
      byId.set(id, list);
    }
    list.push(item);
  }

  const persistedIds = new Set(categories.map((c) => c.costCode));
  const sortedPersisted = [...categories].sort((a, b) => {
    const oa = a.orderIndex ?? 0;
    const ob = b.orderIndex ?? 0;
    if (oa !== ob) return oa - ob;
    return a.costCode.localeCompare(b.costCode);
  });

  const sections: EstimateCategorySectionRow[] = [];

  for (const cat of sortedPersisted) {
    const rows = byId.get(cat.costCode);
    if (!rows?.length) continue;
    const sectionTotal = rows.reduce((s, r) => s + lineTotal(r), 0);
    sections.push({
      categoryId: cat.costCode,
      title: cat.displayName?.trim() || catalogNameByCode?.[cat.costCode]?.trim() || "Category",
      rows,
      sectionTotal,
    });
  }

  const orphanIds = [...byId.keys()]
    .filter((id) => !persistedIds.has(id))
    .sort((a, b) => a.localeCompare(b));

  for (const categoryId of orphanIds) {
    const rows = byId.get(categoryId)!;
    const sectionTotal = rows.reduce((s, r) => s + lineTotal(r), 0);
    const catalogLabel = catalogNameByCode?.[categoryId]?.trim();
    sections.push({
      categoryId,
      title: catalogLabel || "Category",
      rows,
      sectionTotal,
    });
  }

  return sections;
}

/** Compute summary from items and meta. Pass codeToType map (code -> 'material'|'labor'|'subcontractor') for breakdown. */
export function computeSummary(
  items: EstimateItemRow[],
  meta: { tax?: number; discount?: number; overheadPct?: number; profitPct?: number },
  codeToType: (code: string) => "material" | "labor" | "subcontractor" | undefined
): EstimateSummary {
  let materialCost = 0,
    laborCost = 0,
    subcontractorCost = 0;
  for (const row of items) {
    const t = codeToType(row.costCode);
    const tot = lineTotal(row);
    if (t === "material") materialCost += tot;
    else if (t === "labor") laborCost += tot;
    else subcontractorCost += tot;
  }
  const subtotal = items.reduce((s, row) => s + lineTotal(row), 0);
  const overheadPct = meta.overheadPct ?? 0.05;
  const profitPct = meta.profitPct ?? 0.1;
  const markup = subtotal * (overheadPct + profitPct);
  const tax = meta.tax ?? 0;
  const discount = meta.discount ?? 0;
  const total = subtotal + markup + tax - discount;
  return {
    materialCost,
    laborCost,
    subcontractorCost,
    subtotal,
    tax,
    discount,
    markup,
    total,
  };
}

async function grandTotalForList(
  estimateId: string,
  meta: EstimateMetaRecord | null,
  items: EstimateItemRow[],
  codeToType: (c: string) => "material" | "labor" | "subcontractor" | undefined
): Promise<number> {
  if (!meta) return 0;
  const s = computeSummary(items, meta, codeToType);
  return s.total;
}

// —— Create ——

export async function createEstimateWithClient(
  c: SupabaseClient,
  payload: {
    clientName: string;
    projectName: string;
    address: string;
    clientPhone?: string;
    clientEmail?: string;
    estimateDate?: string;
    validUntil?: string;
    notes?: string;
    salesPerson?: string;
    tax?: number;
    discount?: number;
    overheadPct?: number;
    profitPct?: number;
  }
): Promise<string> {
  let number: string;
  const { data: numData } = await c.rpc("next_estimate_number");
  if (typeof numData === "string") number = numData;
  else if (
    Array.isArray(numData) &&
    numData[0] != null &&
    typeof (numData[0] as { next_estimate_number?: string }).next_estimate_number === "string"
  )
    number = (numData[0] as { next_estimate_number: string }).next_estimate_number;
  else number = `EST-${Date.now().toString().slice(-6)}`;

  const now = payload.estimateDate ?? new Date().toISOString().slice(0, 10);
  const { data: row, error: e1 } = await c
    .from("estimates")
    .insert({ number, client: payload.clientName, project: payload.projectName, updated_at: now })
    .select("id")
    .single();

  if (e1) {
    const hint =
      "Run supabase/migrations/RUN_ESTIMATES_MIGRATIONS.sql in Supabase Dashboard → SQL Editor.";
    const raw = e1.message ? ` (${e1.message})` : "";
    const msg = isMissingTable(e1)
      ? `Estimates table missing. Run Supabase migrations. ${hint}${raw}`
      : e1.message;
    throw new Error(msg);
  }
  if (!row) throw new Error("Failed to create estimate: no id returned.");

  const metaIns: Record<string, unknown> = {
    estimate_id: row.id,
    client_name: payload.clientName,
    client_address: payload.address,
    client_phone: payload.clientPhone ?? "",
    client_email: payload.clientEmail ?? "",
    project_name: payload.projectName,
    project_site_address: payload.address,
    estimate_date: now,
    tax: payload.tax ?? 0,
    discount: payload.discount ?? 0,
    overhead_pct: payload.overheadPct ?? 0.05,
    profit_pct: payload.profitPct ?? 0.1,
  };
  if (payload.validUntil != null && payload.validUntil !== "")
    metaIns.valid_until = payload.validUntil;
  if (payload.notes != null) metaIns.notes = payload.notes;
  if (payload.salesPerson != null) metaIns.sales_person = payload.salesPerson;

  const { error: e2 } = await c.from("estimate_meta").insert(metaIns);
  if (e2) {
    const hint =
      "Run supabase/migrations/RUN_ESTIMATES_MIGRATIONS.sql in Supabase Dashboard → SQL Editor.";
    const raw = e2.message ? ` (${e2.message})` : "";
    const msg = isMissingTable(e2)
      ? `estimate_meta table missing. Run Supabase migrations. ${hint}${raw}`
      : e2.message;
    throw new Error(msg);
  }
  return row.id;
}

export async function createEstimate(payload: {
  clientName: string;
  projectName: string;
  address: string;
  clientPhone?: string;
  clientEmail?: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  salesPerson?: string;
  tax?: number;
  discount?: number;
  overheadPct?: number;
  profitPct?: number;
}): Promise<string> {
  return createEstimateWithClient(client(), payload);
}

export async function createEstimateWithItemsWithClient(
  c: SupabaseClient,
  payload: {
    clientName: string;
    projectName: string;
    address: string;
    clientPhone?: string;
    clientEmail?: string;
    estimateDate?: string;
    validUntil?: string;
    notes?: string;
    salesPerson?: string;
    tax?: number;
    discount?: number;
    overheadPct?: number;
    profitPct?: number;
    categoryNames?: Record<string, string>;
    items: Array<{
      costCode: string;
      desc: string;
      qty: number;
      unit: string;
      unitCost: number;
      markupPct: number;
      hideAmountOnPdf?: boolean;
    }>;
    paymentSchedule?: Array<{
      title: string;
      description?: string | null;
      amount: number;
      dueDate?: string | null;
    }>;
  }
): Promise<string> {
  const id = await createEstimateWithClient(c, {
    clientName: payload.clientName,
    projectName: payload.projectName,
    address: payload.address,
    clientPhone: payload.clientPhone,
    clientEmail: payload.clientEmail,
    estimateDate: payload.estimateDate,
    validUntil: payload.validUntil,
    notes: payload.notes,
    salesPerson: payload.salesPerson,
    tax: payload.tax,
    discount: payload.discount,
    overheadPct: payload.overheadPct,
    profitPct: payload.profitPct,
  });
  try {
    if (payload.categoryNames && Object.keys(payload.categoryNames).length > 0) {
      let orderIdx = 0;
      for (const [cost_code, display_name] of Object.entries(payload.categoryNames)) {
        const result = await upsertEstimateCategoryWithOrderFallback(c, {
          estimate_id: id,
          cost_code,
          display_name,
          order_index: orderIdx++,
        });
        if (!result.ok) throw new Error(result.error);
      }
    }
    for (const it of payload.items) {
      const { error } = await c.from("estimate_items").insert({
        estimate_id: id,
        cost_code: it.costCode,
        desc: it.desc,
        qty: it.qty,
        unit: it.unit,
        unit_cost: it.unitCost,
        markup_pct: it.markupPct,
        hide_amount_on_pdf: Boolean(it.hideAmountOnPdf),
      });
      if (error) throw new Error(error.message ?? "Failed to create estimate item.");
    }
    if (payload.paymentSchedule && payload.paymentSchedule.length > 0) {
      for (let idx = 0; idx < payload.paymentSchedule.length; idx++) {
        const ps = payload.paymentSchedule[idx];
        const amount = normalizePaymentAmount(ps.amount);
        const { error } = await c.from("estimate_payment_schedule_items").insert({
          estimate_id: id,
          sort_order: idx,
          title: ps.title,
          description: ps.description ?? null,
          amount,
          due_date: ps.dueDate ?? null,
          status: "draft",
        });
        if (error) throw new Error(error.message ?? "Failed to create payment schedule.");
      }
    }
  } catch (error) {
    await c.from("estimates").delete().eq("id", id);
    throw error;
  }
  return id;
}

export async function createEstimateWithItems(payload: {
  clientName: string;
  projectName: string;
  address: string;
  clientPhone?: string;
  clientEmail?: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  salesPerson?: string;
  tax?: number;
  discount?: number;
  overheadPct?: number;
  profitPct?: number;
  categoryNames?: Record<string, string>;
  items: Array<{
    costCode: string;
    desc: string;
    qty: number;
    unit: string;
    unitCost: number;
    markupPct: number;
    hideAmountOnPdf?: boolean;
  }>;
  paymentSchedule?: Array<{
    title: string;
    description?: string | null;
    amount: number;
    dueDate?: string | null;
  }>;
}): Promise<string> {
  return createEstimateWithItemsWithClient(client(), payload);
}

// —— Read ——

export async function getEstimateList(
  codeToType: (code: string) => "material" | "labor" | "subcontractor" | undefined
): Promise<EstimateListItem[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("estimates")
    .select("id, number, client, project, status, updated_at, approved_at")
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  const out: EstimateListItem[] = [];
  for (const r of rows ?? []) {
    const meta = await getEstimateMeta(r.id);
    const items = await getEstimateItems(r.id);
    const total = await grandTotalForList(r.id, meta, items, codeToType);
    out.push({
      id: r.id,
      number: r.number,
      client: r.client,
      project: r.project,
      status: r.status as EstimateStatus,
      updatedAt: r.updated_at,
      total,
      ...(r.approved_at ? { approvedAt: r.approved_at } : {}),
    });
  }
  return out;
}

export async function getEstimateById(
  id: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateListItem | null> {
  const c = client(explicitClient);
  const { data: r, error } = await c
    .from("estimates")
    .select("id, number, client, project, status, updated_at, approved_at")
    .eq("id", id)
    .single();
  if (error || !r) {
    if (error?.code === "PGRST116" || isMissingTable(error)) return null;
    return null;
  }
  const meta = await getEstimateMeta(id, explicitClient);
  const items = await getEstimateItems(id, explicitClient);
  const codeToType = () => undefined as "material" | "labor" | "subcontractor" | undefined;
  const total = await grandTotalForList(id, meta, items, codeToType);
  return {
    id: r.id,
    number: r.number,
    client: r.client,
    project: r.project,
    status: r.status as EstimateStatus,
    updatedAt: r.updated_at,
    total,
    ...(r.approved_at ? { approvedAt: r.approved_at } : {}),
  };
}

export async function getEstimateMeta(
  estimateId: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateMetaRecord | null> {
  const c = client(explicitClient);
  const { data: r, error } = await c
    .from("estimate_meta")
    .select("*")
    .eq("estimate_id", estimateId)
    .single();
  if (error || !r) {
    if (isMissingTable(error)) return null;
    return null;
  }
  const row = r as Record<string, unknown>;
  return {
    client: {
      name: (row.client_name as string) ?? "",
      phone: (row.client_phone as string) ?? "",
      email: (row.client_email as string) ?? "",
      address: (row.client_address as string) ?? "",
    },
    project: {
      name: (row.project_name as string) ?? "",
      siteAddress: (row.project_site_address as string) ?? "",
    },
    tax: Number(row.tax ?? 0),
    discount: Number(row.discount ?? 0),
    overheadPct: Number(row.overhead_pct ?? 0.05),
    profitPct: Number(row.profit_pct ?? 0.1),
    estimateDate: (row.estimate_date as string) ?? null,
    validUntil: (row.valid_until as string) ?? null,
    notes: (row.notes as string) ?? null,
    salesPerson: (row.sales_person as string) ?? null,
  };
}

async function nextCategoryOrderIndex(c: SupabaseClient, estimateId: string): Promise<number> {
  const { data, error } = await c
    .from("estimate_categories")
    .select("order_index")
    .eq("estimate_id", estimateId);
  if (error) return 0;
  let max = -1;
  for (const r of data ?? []) {
    const oi = Number((r as { order_index?: number }).order_index);
    if (!Number.isNaN(oi)) max = Math.max(max, oi);
  }
  return max + 1;
}

function isMissingOrderIndexColumnError(err: unknown): boolean {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return /order_index/i.test(msg) && /could not find|schema cache|column/i.test(msg);
}

function isMissingColumnError(err: unknown, columnName: string): boolean {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return (
    new RegExp(columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(msg) &&
    /could not find|schema cache|column/i.test(msg)
  );
}

async function upsertEstimateCategoryWithOrderFallback(
  c: SupabaseClient,
  row: { estimate_id: string; cost_code: string; display_name: string; order_index: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await c
    .from("estimate_categories")
    .upsert(row, { onConflict: "estimate_id,cost_code" });
  if (!error) return { ok: true };
  if (isMissingOrderIndexColumnError(error)) {
    const { error: fallbackErr } = await c
      .from("estimate_categories")
      .upsert(
        { estimate_id: row.estimate_id, cost_code: row.cost_code, display_name: row.display_name },
        { onConflict: "estimate_id,cost_code" }
      );
    if (!fallbackErr) return { ok: true };
    return { ok: false, error: fallbackErr.message || "Could not save category." };
  }
  return { ok: false, error: error.message || "Could not save category." };
}

function mapEstimateCategoryRecord(
  row: { cost_code?: string | null; display_name?: string | null; order_index?: number | null },
  fallbackIndex: number
): EstimateCategoryRecord {
  const costCode = typeof row.cost_code === "string" ? row.cost_code.trim() : "";
  const displayName =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : costCode || "Category";
  return {
    costCode,
    displayName,
    orderIndex: row.order_index != null ? Number(row.order_index) : fallbackIndex,
  };
}

export async function getEstimateCategories(
  estimateId: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateCategoryRecord[]> {
  const c = client(explicitClient);
  const { data: rows, error } = await c
    .from("estimate_categories")
    .select("cost_code, display_name, order_index")
    .eq("estimate_id", estimateId)
    .order("order_index", { ascending: true })
    .order("cost_code", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    if (isMissingOrderIndexColumnError(error)) {
      const { data: fallbackRows, error: fallbackError } = await c
        .from("estimate_categories")
        .select("cost_code, display_name")
        .eq("estimate_id", estimateId)
        .order("cost_code", { ascending: true });
      if (fallbackError) return [];
      return (fallbackRows ?? []).map(
        (r: { cost_code?: string | null; display_name?: string | null }, index) =>
          mapEstimateCategoryRecord(r, index)
      );
    }
    return [];
  }
  return (rows ?? []).map(
    (r: { cost_code?: string | null; display_name?: string | null; order_index?: number | null }) =>
      mapEstimateCategoryRecord(r, 0)
  );
}

export async function getEstimateItems(
  estimateId: string,
  explicitClient?: SupabaseClient | null
): Promise<EstimateItemRow[]> {
  const c = client(explicitClient);
  const { data: rows, error } = await c
    .from("estimate_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("cost_code");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (rows ?? []).map((r) => mapEstimateItemRow(r as Record<string, unknown>));
}

function toSnapshotRecord(r: Record<string, unknown>): EstimateSnapshotRecord {
  const metaJson = (r.meta_json as Record<string, unknown> | null) ?? null;
  const itemsJson = (r.items_json as unknown) ?? [];
  const summaryJson = (r.summary_json as Record<string, unknown> | null) ?? null;
  const frozen = (r.frozen_payload as Record<string, unknown> | null) ?? null;

  const meta: (EstimateMetaRecord & { categoryNames?: Record<string, string> }) | null =
    metaJson && typeof metaJson === "object"
      ? ({
          client: (metaJson.client as EstimateMetaRecord["client"]) ?? {
            name: "",
            phone: "",
            email: "",
            address: "",
          },
          project: (metaJson.project as EstimateMetaRecord["project"]) ?? {
            name: "",
            siteAddress: "",
          },
          tax: Number((metaJson.tax as number) ?? 0) || 0,
          discount: Number((metaJson.discount as number) ?? 0) || 0,
          overheadPct: Number((metaJson.overheadPct as number) ?? 0.05) || 0.05,
          profitPct: Number((metaJson.profitPct as number) ?? 0.1) || 0.1,
          estimateDate: (metaJson.estimateDate as string | null) ?? null,
          validUntil: (metaJson.validUntil as string | null) ?? null,
          notes: (metaJson.notes as string | null) ?? null,
          salesPerson: (metaJson.salesPerson as string | null) ?? null,
          ...(metaJson.categoryNames && typeof metaJson.categoryNames === "object"
            ? { categoryNames: metaJson.categoryNames as Record<string, string> }
            : {}),
        } as EstimateMetaRecord & { categoryNames?: Record<string, string> })
      : null;

  const items: EstimateItemRow[] = Array.isArray(itemsJson)
    ? (itemsJson as Array<Record<string, unknown>>).map((it) => ({
        id: (it.id as string) ?? "",
        estimateId: (it.estimateId as string) ?? (r.estimate_id as string) ?? "",
        costCode: (it.costCode as string) ?? "",
        desc: (it.desc as string) ?? "",
        qty: Number(it.qty) || 0,
        unit: (it.unit as string) ?? "EA",
        unitCost: Number(it.unitCost) || 0,
        markupPct: Number(it.markupPct) || 0,
        hideAmountOnPdf: Boolean(it.hideAmountOnPdf),
      }))
    : [];

  const summary: EstimateSummary | null =
    summaryJson && typeof summaryJson === "object"
      ? ({
          materialCost: Number((summaryJson.materialCost as number) ?? 0) || 0,
          laborCost: Number((summaryJson.laborCost as number) ?? 0) || 0,
          subcontractorCost: Number((summaryJson.subcontractorCost as number) ?? 0) || 0,
          subtotal: Number((summaryJson.subtotal as number) ?? 0) || 0,
          tax: Number((summaryJson.tax as number) ?? 0) || 0,
          discount: Number((summaryJson.discount as number) ?? 0) || 0,
          markup: Number((summaryJson.markup as number) ?? 0) || 0,
          total: Number((summaryJson.total as number) ?? 0) || 0,
        } as EstimateSummary)
      : null;

  const frozenPayload = {
    items:
      frozen && Array.isArray(frozen.items)
        ? (frozen.items as Array<{ qty?: unknown; unitCost?: unknown; markupPct?: unknown }>).map(
            (x) => ({
              qty: Number(x.qty) || 0,
              unitCost: Number(x.unitCost) || 0,
              markupPct: Number(x.markupPct) || 0,
            })
          )
        : items.map((i) => ({ qty: i.qty, unitCost: i.unitCost, markupPct: i.markupPct })),
    overheadPct: Number(frozen?.overheadPct ?? meta?.overheadPct ?? 0.05) || 0.05,
    profitPct: Number(frozen?.profitPct ?? meta?.profitPct ?? 0.1) || 0.1,
  };

  return {
    snapshotId: (r.id as string) ?? "",
    estimateId: (r.estimate_id as string) ?? "",
    version: Number(r.version) || 0,
    createdAt: ((r.created_at as string) ?? "").slice(0, 10),
    statusAtSnapshot: (r.status_at_snapshot as string) ?? "",
    meta,
    items,
    summary,
    frozenPayload,
  };
}

export async function listEstimateSnapshots(estimateId: string): Promise<EstimateSnapshotRecord[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("estimate_snapshots")
    .select(
      "id, estimate_id, version, created_at, status_at_snapshot, meta_json, items_json, summary_json, frozen_payload"
    )
    .eq("estimate_id", estimateId)
    .order("version", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load estimate snapshots.");
  }
  return (rows ?? []).map((r: Record<string, unknown>) => toSnapshotRecord(r));
}

export async function getEstimateSnapshotByVersion(
  estimateId: string,
  version: number
): Promise<EstimateSnapshotRecord | null> {
  const c = client();
  const { data: row, error } = await c
    .from("estimate_snapshots")
    .select(
      "id, estimate_id, version, created_at, status_at_snapshot, meta_json, items_json, summary_json, frozen_payload"
    )
    .eq("estimate_id", estimateId)
    .eq("version", version)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load estimate snapshot.");
  }
  if (!row) return null;
  return toSnapshotRecord(row as Record<string, unknown>);
}

export async function createEstimateSnapshot(estimateId: string): Promise<string | null> {
  const c = client();
  const [estimate, meta, items, categories] = await Promise.all([
    getEstimateById(estimateId),
    getEstimateMeta(estimateId),
    getEstimateItems(estimateId),
    getEstimateCategories(estimateId),
  ]);
  if (!estimate || !meta) return null;

  const categoryNames = categories.reduce<Record<string, string>>((acc, r) => {
    acc[r.costCode] = r.displayName;
    return acc;
  }, {});

  const summary = computeSummary(items, meta, () => {
    // Estimate module code->type mapping lives in data/index.ts; for snapshot we just keep summary totals from computeSummary.
    // If a cost code isn't mapped, it falls into subcontractorCost per computeSummary logic.
    return undefined;
  });

  const { data: maxRow } = await c
    .from("estimate_snapshots")
    .select("version")
    .eq("estimate_id", estimateId)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion =
    maxRow && maxRow[0] && Number((maxRow[0] as { version?: number }).version)
      ? Number((maxRow[0] as { version?: number }).version) + 1
      : 1;

  const metaJson = {
    ...meta,
    categoryNames,
  };
  const frozenPayload = {
    items: items.map((i) => ({ qty: i.qty, unitCost: i.unitCost, markupPct: i.markupPct })),
    overheadPct: meta.overheadPct ?? 0.05,
    profitPct: meta.profitPct ?? 0.1,
  };

  const { data: inserted, error } = await c
    .from("estimate_snapshots")
    .insert({
      estimate_id: estimateId,
      version: nextVersion,
      status_at_snapshot: estimate.status ?? "Draft",
      meta_json: metaJson,
      items_json: items,
      summary_json: summary,
      frozen_payload: frozenPayload,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingTable(error))
      throw new Error("estimate_snapshots table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to create snapshot.");
  }
  return (inserted as { id?: string } | null)?.id ?? null;
}

export async function createNewVersionFromSnapshot(estimateId: string): Promise<boolean> {
  const c = client();
  const latest = (await listEstimateSnapshots(estimateId)).sort((a, b) => b.version - a.version)[0];
  if (!latest?.meta) return false;

  // Create next snapshot version (copy frozen payload).
  const nextVersion = (latest.version || 0) + 1;
  await c.from("estimate_snapshots").insert({
    estimate_id: estimateId,
    version: nextVersion,
    status_at_snapshot: "Draft",
    meta_json: latest.meta,
    items_json: latest.items,
    summary_json: latest.summary ?? {},
    frozen_payload: latest.frozenPayload,
  });

  // Unlock estimate for editing by moving back to Draft, then restore meta/items.
  await c
    .from("estimates")
    .update({ status: "Draft", updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateId);

  // Restore meta (bypass updateEstimateMeta restrictions by updating directly).
  const m = latest.meta;
  await c
    .from("estimate_meta")
    .update({
      client_name: m.client.name,
      client_address: m.client.address,
      project_name: m.project.name,
      project_site_address: m.project.siteAddress,
      tax: m.tax,
      discount: m.discount,
      overhead_pct: m.overheadPct,
      profit_pct: m.profitPct,
      estimate_date: m.estimateDate,
      valid_until: m.validUntil,
      notes: m.notes,
      sales_person: m.salesPerson,
    })
    .eq("estimate_id", estimateId);

  // Restore categories (stable order from meta keys)
  const categoryNames = (m as { categoryNames?: Record<string, string> }).categoryNames ?? {};
  const catEntries = Object.entries(categoryNames);
  for (let i = 0; i < catEntries.length; i++) {
    const [cost_code, display_name] = catEntries[i];
    const result = await upsertEstimateCategoryWithOrderFallback(c, {
      estimate_id: estimateId,
      cost_code,
      display_name,
      order_index: i,
    });
    if (!result.ok) throw new Error(result.error);
  }

  // Restore items: replace all
  await c.from("estimate_items").delete().eq("estimate_id", estimateId);
  if (latest.items.length > 0) {
    await c.from("estimate_items").insert(
      latest.items.map((it) => ({
        estimate_id: estimateId,
        cost_code: it.costCode,
        desc: it.desc,
        qty: it.qty,
        unit: it.unit,
        unit_cost: it.unitCost,
        markup_pct: it.markupPct,
        hide_amount_on_pdf: Boolean(it.hideAmountOnPdf),
      }))
    );
  }

  return true;
}

// —— Update ——

export async function updateEstimateMetaWithClient(
  c: SupabaseClient,
  estimateId: string,
  payload: {
    client?: { name?: string; address?: string };
    project?: { name?: string; siteAddress?: string };
    tax?: number;
    discount?: number;
    overheadPct?: number;
    profitPct?: number;
    estimateDate?: string;
    validUntil?: string;
    notes?: string;
    salesPerson?: string;
    categoryNames?: Record<string, string>;
  }
): Promise<boolean> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;

  const updates: Record<string, unknown> = {};
  if (payload.client?.name != null) updates.client_name = payload.client.name;
  if (payload.client?.address != null) {
    updates.client_address = payload.client.address;
    updates.project_site_address = payload.project?.siteAddress ?? payload.client.address;
  }
  if (payload.project?.name != null) updates.project_name = payload.project.name;
  if (payload.project?.siteAddress != null)
    updates.project_site_address = payload.project.siteAddress;
  if (payload.tax != null) updates.tax = payload.tax;
  if (payload.discount != null) updates.discount = payload.discount;
  if (payload.overheadPct != null) updates.overhead_pct = payload.overheadPct;
  if (payload.profitPct != null) updates.profit_pct = payload.profitPct;
  if (payload.estimateDate != null) updates.estimate_date = payload.estimateDate || null;
  if (payload.validUntil != null) updates.valid_until = payload.validUntil || null;
  if (payload.notes != null) updates.notes = payload.notes;
  if (payload.salesPerson != null) updates.sales_person = payload.salesPerson;

  if (Object.keys(updates).length > 0) {
    const { error: e1 } = await c
      .from("estimate_meta")
      .update(updates)
      .eq("estimate_id", estimateId);
    if (e1) return false;
    const estRow: Record<string, string> = { updated_at: new Date().toISOString().slice(0, 10) };
    if (payload.client?.name) estRow.client = payload.client.name;
    if (payload.project?.name) estRow.project = payload.project.name;
    await c.from("estimates").update(estRow).eq("id", estimateId);
  }

  if (payload.categoryNames && Object.keys(payload.categoryNames).length > 0) {
    for (const [cost_code, display_name] of Object.entries(payload.categoryNames)) {
      const { data: existing } = await c
        .from("estimate_categories")
        .select("order_index")
        .eq("estimate_id", estimateId)
        .eq("cost_code", cost_code)
        .maybeSingle();
      const oi =
        existing && (existing as { order_index?: number }).order_index != null
          ? Number((existing as { order_index: number }).order_index)
          : await nextCategoryOrderIndex(c, estimateId);
      const up = await upsertEstimateCategoryWithOrderFallback(c, {
        estimate_id: estimateId,
        cost_code,
        display_name,
        order_index: oi,
      });
      if (!up.ok) return false;
    }
    await c
      .from("estimates")
      .update({ updated_at: new Date().toISOString().slice(0, 10) })
      .eq("id", estimateId);
  }
  return true;
}

export async function updateEstimateMeta(
  estimateId: string,
  payload: {
    client?: { name?: string; address?: string };
    project?: { name?: string; siteAddress?: string };
    tax?: number;
    discount?: number;
    overheadPct?: number;
    profitPct?: number;
    estimateDate?: string;
    validUntil?: string;
    notes?: string;
    salesPerson?: string;
    categoryNames?: Record<string, string>;
  }
): Promise<boolean> {
  return updateEstimateMetaWithClient(client(), estimateId, payload);
}

/** Persist category section order (Cost Breakdown). Upserts rows so orphans gain a category row. */
export async function reorderEstimateCategoriesWithClient(
  c: SupabaseClient,
  estimateId: string,
  orderedCostCodes: string[],
  displayNamesByCode: Record<string, string>
): Promise<boolean> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;

  const { data: existingRows } = await c
    .from("estimate_categories")
    .select("cost_code, display_name")
    .eq("estimate_id", estimateId);
  const existingNames: Record<string, string> = Object.fromEntries(
    (existingRows ?? []).map((r: { cost_code: string; display_name: string }) => [
      r.cost_code,
      r.display_name,
    ])
  );

  for (let i = 0; i < orderedCostCodes.length; i++) {
    const cost_code = orderedCostCodes[i];
    const fromMap = displayNamesByCode[cost_code]?.trim();
    const display_name = (fromMap || existingNames[cost_code] || cost_code).trim() || cost_code;
    const up = await upsertEstimateCategoryWithOrderFallback(c, {
      estimate_id: estimateId,
      cost_code,
      display_name,
      order_index: i,
    });
    if (!up.ok) return false;
  }
  await c
    .from("estimates")
    .update({ updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateId);
  return true;
}

export async function reorderEstimateCategories(
  estimateId: string,
  orderedCostCodes: string[],
  displayNamesByCode: Record<string, string>
): Promise<boolean> {
  return reorderEstimateCategoriesWithClient(
    client(),
    estimateId,
    orderedCostCodes,
    displayNamesByCode
  );
}

type LineItemInsertPayload = {
  costCode: string;
  desc: string;
  qty: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  hideAmountOnPdf?: boolean;
};

function mapEstimateItemRow(r: Record<string, unknown>): EstimateItemRow {
  return {
    id: r.id as string,
    estimateId: r.estimate_id as string,
    costCode: (r.cost_code as string) ?? "",
    desc: (r.desc as string) ?? "",
    qty: Number(r.qty),
    unit: (r.unit as string) ?? "EA",
    unitCost: Number(r.unit_cost),
    markupPct: Number(r.markup_pct),
    hideAmountOnPdf: Boolean(r.hide_amount_on_pdf),
  };
}

export async function addLineItemWithClient(
  c: SupabaseClient,
  estimateId: string,
  item: LineItemInsertPayload
): Promise<EstimateItemRow | null> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return null;
  const { data: inserted, error } = await c
    .from("estimate_items")
    .insert({
      estimate_id: estimateId,
      cost_code: item.costCode,
      desc: item.desc,
      qty: item.qty,
      unit: item.unit,
      unit_cost: item.unitCost,
      markup_pct: item.markupPct,
      hide_amount_on_pdf: Boolean(item.hideAmountOnPdf),
    })
    .select("*")
    .single();
  if (error || !inserted) return null;
  const now = new Date().toISOString().slice(0, 10);
  await c.from("estimates").update({ updated_at: now }).eq("id", estimateId);
  return mapEstimateItemRow(inserted as Record<string, unknown>);
}

export async function addLineItem(
  estimateId: string,
  item: LineItemInsertPayload
): Promise<EstimateItemRow | null> {
  return addLineItemWithClient(client(), estimateId, item);
}

async function generateUniqueCustomCostCode(
  c: ReturnType<typeof client>,
  estimateId: string
): Promise<string> {
  const { data: catRows } = await c
    .from("estimate_categories")
    .select("cost_code")
    .eq("estimate_id", estimateId);
  const { data: itemRows } = await c
    .from("estimate_items")
    .select("cost_code")
    .eq("estimate_id", estimateId);

  const used = new Set<string>();
  for (const r of catRows ?? [])
    used.add(String((r as { cost_code?: string }).cost_code ?? "").trim());
  for (const r of itemRows ?? [])
    used.add(String((r as { cost_code?: string }).cost_code ?? "").trim());

  let candidate = generateCode(used);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!used.has(candidate)) return candidate;
    const n = Number.parseInt(candidate, 10);
    if (!Number.isFinite(n)) break;
    candidate = String(Math.min(n + 10_000, 999_999)).padStart(6, "0");
  }
  return candidate;
}

/** Create a custom cost category (generated cost code + display name) and one placeholder line item. */
export async function createCustomEstimateCategoryWithClient(
  c: SupabaseClient,
  estimateId: string,
  displayName: string
): Promise<{ ok: true; costCode: string; item: EstimateItemRow } | { ok: false; error: string }> {
  const estimateIdSafe = estimateId.trim();
  if (!estimateIdSafe) return { ok: false, error: "Estimate id is required." };
  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  const { data: est } = await c
    .from("estimates")
    .select("status")
    .eq("id", estimateIdSafe)
    .single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) {
    return { ok: false, error: "Estimate cannot be edited." };
  }

  const costCode = await generateUniqueCustomCostCode(c, estimateIdSafe);
  const orderIndex = await nextCategoryOrderIndex(c, estimateIdSafe);

  const { error: eCat } = await c.from("estimate_categories").upsert(
    {
      estimate_id: estimateIdSafe,
      cost_code: costCode,
      display_name: trimmed,
      order_index: orderIndex,
    },
    { onConflict: "estimate_id,cost_code" }
  );
  if (eCat && isMissingOrderIndexColumnError(eCat)) {
    // Backward-compat guard: some environments haven't refreshed schema cache for order_index yet.
    const { error: fallbackErr } = await c
      .from("estimate_categories")
      .upsert(
        { estimate_id: estimateIdSafe, cost_code: costCode, display_name: trimmed },
        { onConflict: "estimate_id,cost_code" }
      );
    if (!fallbackErr) {
      const item = await addLineItemWithClient(c, estimateIdSafe, {
        costCode,
        desc: "New item",
        qty: 1,
        unit: "EA",
        unitCost: 0,
        markupPct: 0.1,
      });
      if (!item) {
        await c
          .from("estimate_categories")
          .delete()
          .eq("estimate_id", estimateIdSafe)
          .eq("cost_code", costCode);
        return { ok: false, error: "Could not create category line item." };
      }
      return { ok: true, costCode, item };
    }
    return { ok: false, error: fallbackErr.message || "Could not create category." };
  }
  if (eCat) {
    const msg = eCat.message ?? "";
    if (/duplicate|unique/i.test(msg)) return { ok: false, error: "This code is already in use." };
    return { ok: false, error: eCat.message || "Could not create category." };
  }

  const item = await addLineItemWithClient(c, estimateIdSafe, {
    costCode,
    desc: "New item",
    qty: 1,
    unit: "EA",
    unitCost: 0,
    markupPct: 0.1,
  });
  if (!item) {
    await c
      .from("estimate_categories")
      .delete()
      .eq("estimate_id", estimateIdSafe)
      .eq("cost_code", costCode);
    return { ok: false, error: "Could not create category line item." };
  }
  return { ok: true, costCode, item };
}

export async function createCustomEstimateCategory(
  estimateId: string,
  displayName: string
): Promise<{ ok: true; costCode: string; item: EstimateItemRow } | { ok: false; error: string }> {
  return createCustomEstimateCategoryWithClient(client(), estimateId, displayName);
}

/** Create category with an explicit cost code + display name and one placeholder line item. */
export async function createEstimateCategoryWithExplicitCodeWithClient(
  c: SupabaseClient,
  estimateId: string,
  costCodeRaw: string,
  displayNameRaw: string
): Promise<{ ok: true; costCode: string; item: EstimateItemRow } | { ok: false; error: string }> {
  const estimateIdSafe = estimateId.trim();
  if (!estimateIdSafe) return { ok: false, error: "Estimate id is required." };
  const costCode = costCodeRaw.trim();
  const displayName = displayNameRaw.trim();
  if (!displayName) return { ok: false, error: "Name is required." };
  if (!costCode) return { ok: false, error: "Code is required." };
  const { data: est } = await c
    .from("estimates")
    .select("status")
    .eq("id", estimateIdSafe)
    .single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) {
    return { ok: false, error: "Estimate cannot be edited." };
  }

  const { data: dupCat } = await c
    .from("estimate_categories")
    .select("cost_code")
    .eq("estimate_id", estimateIdSafe)
    .eq("cost_code", costCode)
    .maybeSingle();
  if (dupCat) return { ok: false, error: "This code is already in use." };

  const { data: dupIt } = await c
    .from("estimate_items")
    .select("id")
    .eq("estimate_id", estimateIdSafe)
    .eq("cost_code", costCode)
    .limit(1)
    .maybeSingle();
  if (dupIt) return { ok: false, error: "This code is already in use." };

  const orderIndex = await nextCategoryOrderIndex(c, estimateIdSafe);

  const { error: eCat } = await c.from("estimate_categories").insert({
    estimate_id: estimateIdSafe,
    cost_code: costCode,
    display_name: displayName,
    order_index: orderIndex,
  });
  if (eCat && isMissingOrderIndexColumnError(eCat)) {
    // Backward-compat guard: retry without order_index when remote schema cache is stale.
    const { error: fallbackErr } = await c.from("estimate_categories").insert({
      estimate_id: estimateIdSafe,
      cost_code: costCode,
      display_name: displayName,
    });
    if (!fallbackErr) {
      const item = await addLineItemWithClient(c, estimateIdSafe, {
        costCode,
        desc: "New item",
        qty: 1,
        unit: "EA",
        unitCost: 0,
        markupPct: 0.1,
      });
      if (!item) {
        await c
          .from("estimate_categories")
          .delete()
          .eq("estimate_id", estimateIdSafe)
          .eq("cost_code", costCode);
        return { ok: false, error: "Could not create category line item." };
      }
      return { ok: true, costCode, item };
    }
    return { ok: false, error: fallbackErr.message || "Could not create category." };
  }
  if (eCat) {
    const msg = eCat.message ?? "";
    if (/duplicate|unique/i.test(msg)) return { ok: false, error: "This code is already in use." };
    return { ok: false, error: eCat.message || "Could not create category." };
  }

  const item = await addLineItemWithClient(c, estimateIdSafe, {
    costCode,
    desc: "New item",
    qty: 1,
    unit: "EA",
    unitCost: 0,
    markupPct: 0.1,
  });
  if (!item) {
    await c
      .from("estimate_categories")
      .delete()
      .eq("estimate_id", estimateIdSafe)
      .eq("cost_code", costCode);
    return { ok: false, error: "Could not create category line item." };
  }
  return { ok: true, costCode, item };
}

export async function createEstimateCategoryWithExplicitCode(
  estimateId: string,
  costCodeRaw: string,
  displayNameRaw: string
): Promise<{ ok: true; costCode: string; item: EstimateItemRow } | { ok: false; error: string }> {
  return createEstimateCategoryWithExplicitCodeWithClient(
    client(),
    estimateId,
    costCodeRaw,
    displayNameRaw
  );
}

/** Update only one category display_name, without touching estimate meta fields. */
export async function updateEstimateCategoryDisplayNameWithClient(
  c: SupabaseClient,
  estimateId: string,
  costCode: string,
  displayName: string
): Promise<boolean> {
  const estimateIdSafe = estimateId.trim();
  const costCodeSafe = costCode.trim();
  const nameSafe = displayName.trim();
  if (!estimateIdSafe || !costCodeSafe || !nameSafe) return false;

  const { data: est } = await c
    .from("estimates")
    .select("status")
    .eq("id", estimateIdSafe)
    .single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;

  const { data: existing } = await c
    .from("estimate_categories")
    .select("order_index")
    .eq("estimate_id", estimateIdSafe)
    .eq("cost_code", costCodeSafe)
    .maybeSingle();
  const oi =
    existing && (existing as { order_index?: number }).order_index != null
      ? Number((existing as { order_index: number }).order_index)
      : await nextCategoryOrderIndex(c, estimateIdSafe);

  const up = await upsertEstimateCategoryWithOrderFallback(c, {
    estimate_id: estimateIdSafe,
    cost_code: costCodeSafe,
    display_name: nameSafe,
    order_index: oi,
  });
  if (!up.ok) return false;
  await c
    .from("estimates")
    .update({ updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateIdSafe);
  return true;
}

export async function updateEstimateCategoryDisplayName(
  estimateId: string,
  costCode: string,
  displayName: string
): Promise<boolean> {
  return updateEstimateCategoryDisplayNameWithClient(client(), estimateId, costCode, displayName);
}

export async function updateLineItemWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string,
  payload: {
    desc?: string;
    qty?: number;
    unit?: string;
    unitCost?: number;
    markupPct?: number;
    hideAmountOnPdf?: boolean;
  }
): Promise<boolean> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;
  const up: Record<string, unknown> = {};
  if (payload.desc != null) up.desc = payload.desc;
  if (payload.qty != null) up.qty = payload.qty;
  if (payload.unit != null) up.unit = payload.unit;
  if (payload.unitCost != null) up.unit_cost = payload.unitCost;
  if (payload.markupPct != null) up.markup_pct = payload.markupPct;
  if (payload.hideAmountOnPdf != null) up.hide_amount_on_pdf = payload.hideAmountOnPdf;
  if (Object.keys(up).length === 0) return true;
  const { error } = await c
    .from("estimate_items")
    .update(up)
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  if (error) return false;
  await c
    .from("estimates")
    .update({ updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateId);
  return true;
}

export async function updateLineItem(
  estimateId: string,
  itemId: string,
  payload: { desc?: string; qty?: number; unit?: string; unitCost?: number; markupPct?: number }
): Promise<boolean> {
  return updateLineItemWithClient(client(), estimateId, itemId, payload);
}

/** Move line items to another cost code (category). Creates `estimate_categories` row if missing. */
export async function moveEstimateItemsToCostCodeWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemIds: string[],
  newCostCode: string,
  displayNameHint?: string
): Promise<boolean> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;
  if (itemIds.length === 0) return true;

  const hint = (displayNameHint ?? newCostCode).trim() || newCostCode;
  const { data: catRow } = await c
    .from("estimate_categories")
    .select("cost_code")
    .eq("estimate_id", estimateId)
    .eq("cost_code", newCostCode)
    .maybeSingle();
  if (!catRow) {
    const oi = await nextCategoryOrderIndex(c, estimateId);
    const up = await upsertEstimateCategoryWithOrderFallback(c, {
      estimate_id: estimateId,
      cost_code: newCostCode,
      display_name: hint,
      order_index: oi,
    });
    if (!up.ok) return false;
  }

  const { error } = await c
    .from("estimate_items")
    .update({ cost_code: newCostCode })
    .in("id", itemIds)
    .eq("estimate_id", estimateId);
  if (error) return false;
  await c
    .from("estimates")
    .update({ updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateId);
  return true;
}

export async function moveEstimateItemsToCostCode(
  estimateId: string,
  itemIds: string[],
  newCostCode: string,
  displayNameHint?: string
): Promise<boolean> {
  return moveEstimateItemsToCostCodeWithClient(
    client(),
    estimateId,
    itemIds,
    newCostCode,
    displayNameHint
  );
}

export async function deleteLineItemWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string
): Promise<boolean> {
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;
  const { error } = await c
    .from("estimate_items")
    .delete()
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  if (error) return false;
  await c
    .from("estimates")
    .update({ updated_at: new Date().toISOString().slice(0, 10) })
    .eq("id", estimateId);
  return true;
}

export async function deleteLineItem(estimateId: string, itemId: string): Promise<boolean> {
  return deleteLineItemWithClient(client(), estimateId, itemId);
}

export async function duplicateLineItemWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string
): Promise<EstimateItemRow | null> {
  const { data: rows, error } = await c
    .from("estimate_items")
    .select("*")
    .eq("estimate_id", estimateId);
  if (error) return null;
  const src = (rows ?? []).find((r) => String((r as { id?: string }).id) === itemId);
  if (!src) return null;
  const row = src as Record<string, unknown>;
  return addLineItemWithClient(c, estimateId, {
    costCode: (row.cost_code as string) ?? "",
    desc: `${(row.desc as string) ?? ""} (copy)`,
    qty: Number(row.qty),
    unit: (row.unit as string) ?? "EA",
    unitCost: Number(row.unit_cost),
    markupPct: Number(row.markup_pct),
    hideAmountOnPdf: Boolean(row.hide_amount_on_pdf),
  });
}

export async function duplicateLineItem(
  estimateId: string,
  itemId: string
): Promise<EstimateItemRow | null> {
  return duplicateLineItemWithClient(client(), estimateId, itemId);
}

// —— Payment schedule ——

function normalizePaymentAmount(amount: number): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Payment amount must be a non-negative number.");
  }
  return value;
}

function normalizePaymentStatus(status: unknown): PaymentScheduleItem["status"] {
  if (status === "invoiced" || status === "paid") return status;
  return "draft";
}

function mapPaymentScheduleRow(row: Record<string, unknown>): PaymentScheduleItem {
  return {
    id: row.id as string,
    estimateId: row.estimate_id as string,
    sortOrder: Number(row.sort_order ?? 0),
    title: (row.title as string) ?? "",
    description: (row.description as string) ?? null,
    amount: Number(row.amount ?? 0),
    dueDate: (row.due_date as string) ?? null,
    status: normalizePaymentStatus(row.status),
    invoiceId: (row.invoice_id as string) ?? null,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

async function canWritePaymentSchedule(c: SupabaseClient, estimateId: string): Promise<boolean> {
  const { data: est, error } = await c
    .from("estimates")
    .select("id, status")
    .eq("id", estimateId)
    .single();
  if (error || !est) return false;
  return ["Draft", "Sent"].includes(est.status as string);
}

export async function getPaymentSchedule(
  estimateId: string,
  explicitClient?: SupabaseClient | null
): Promise<PaymentScheduleItem[]> {
  const c = client(explicitClient);
  const { data: rows, error } = await c
    .from("estimate_payment_schedule_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    if (isMissingColumnError(error, "sort_order")) {
      const { data: fallbackRows, error: fallbackError } = await c
        .from("estimate_payment_schedule_items")
        .select("*")
        .eq("estimate_id", estimateId);
      if (fallbackError) return [];
      return (fallbackRows ?? []).map((r: Record<string, unknown>) => mapPaymentScheduleRow(r));
    }
    throw new Error(error.message);
  }
  return (rows ?? []).map((r: Record<string, unknown>) => mapPaymentScheduleRow(r));
}

export async function addPaymentMilestoneWithClient(
  c: SupabaseClient,
  estimateId: string,
  item: PaymentScheduleWriteInput
): Promise<PaymentScheduleItem | null> {
  if (!(await canWritePaymentSchedule(c, estimateId))) return null;
  const { data: maxRows } = await c
    .from("estimate_payment_schedule_items")
    .select("sort_order")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const max = Array.isArray(maxRows) ? maxRows[0] : null;
  const sortOrder = max?.sort_order != null ? Number(max.sort_order) + 1 : 0;
  const amount = normalizePaymentAmount(item.amount);
  const { data: inserted, error } = await c
    .from("estimate_payment_schedule_items")
    .insert({
      estimate_id: estimateId,
      sort_order: sortOrder,
      title: item.title.trim() || "Payment",
      description: item.description?.trim() || null,
      amount,
      due_date: item.dueDate ?? null,
      status: item.status ?? "draft",
      invoice_id: item.invoiceId ?? null,
    })
    .select("*")
    .single();
  if (error || !inserted) return null;
  return mapPaymentScheduleRow(inserted as Record<string, unknown>);
}

export async function addPaymentMilestone(
  estimateId: string,
  item: PaymentScheduleWriteInput
): Promise<PaymentScheduleItem | null> {
  return addPaymentMilestoneWithClient(client(), estimateId, item);
}

export async function updatePaymentMilestoneWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string,
  payload: Partial<PaymentScheduleWriteInput>
): Promise<boolean> {
  if (!(await canWritePaymentSchedule(c, estimateId))) return false;
  const up: Record<string, unknown> = {};
  if (payload.title != null) up.title = payload.title.trim() || "Payment";
  if (payload.description !== undefined) up.description = payload.description?.trim() || null;
  if (payload.amount != null) up.amount = normalizePaymentAmount(payload.amount);
  if (payload.dueDate !== undefined) up.due_date = payload.dueDate ?? null;
  if (payload.status != null) up.status = payload.status;
  if (payload.invoiceId !== undefined) up.invoice_id = payload.invoiceId ?? null;
  if (Object.keys(up).length === 0) return true;
  const { error } = await c
    .from("estimate_payment_schedule_items")
    .update(up)
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  return !error;
}

export async function updatePaymentMilestone(
  estimateId: string,
  itemId: string,
  payload: Partial<PaymentScheduleWriteInput>
): Promise<boolean> {
  return updatePaymentMilestoneWithClient(client(), estimateId, itemId, payload);
}

/** Reorder payment schedule by updating sort_order for each item. orderedItemIds = ids in desired order. */
export async function reorderPaymentScheduleWithClient(
  c: SupabaseClient,
  estimateId: string,
  orderedItemIds: string[]
): Promise<boolean> {
  if (!(await canWritePaymentSchedule(c, estimateId))) return false;
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await c
      .from("estimate_payment_schedule_items")
      .update({ sort_order: i })
      .eq("id", orderedItemIds[i])
      .eq("estimate_id", estimateId);
    if (error) return false;
  }
  return true;
}

export async function reorderPaymentSchedule(
  estimateId: string,
  orderedItemIds: string[]
): Promise<boolean> {
  return reorderPaymentScheduleWithClient(client(), estimateId, orderedItemIds);
}

export async function deletePaymentMilestoneWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string
): Promise<boolean> {
  if (!(await canWritePaymentSchedule(c, estimateId))) return false;
  const { error } = await c
    .from("estimate_payment_schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  return !error;
}

export async function deletePaymentMilestone(estimateId: string, itemId: string): Promise<boolean> {
  return deletePaymentMilestoneWithClient(client(), estimateId, itemId);
}

export async function markPaymentMilestonePaidWithClient(
  c: SupabaseClient,
  estimateId: string,
  itemId: string
): Promise<boolean> {
  const { error } = await c
    .from("estimate_payment_schedule_items")
    .update({ status: "paid" })
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  return !error;
}

export async function markPaymentMilestonePaid(
  estimateId: string,
  itemId: string
): Promise<boolean> {
  return markPaymentMilestonePaidWithClient(client(), estimateId, itemId);
}

/** Compute scheduled amount for one milestone based on estimate total. */
export function paymentMilestoneAmount(item: PaymentScheduleItem, estimateTotal: number): number {
  void estimateTotal;
  return item.amount;
}

// —— Payment schedule templates ——

export type PaymentScheduleTemplate = {
  id: string;
  name: string;
};

export type PaymentScheduleTemplateItem = {
  id: string;
  templateId: string;
  sortOrder: number;
  title: string;
  amountType: "percent" | "fixed";
  value: number;
  dueRule: string;
  notes: string | null;
};

export async function listPaymentTemplates(): Promise<PaymentScheduleTemplate[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("payment_schedule_templates")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message);
  }
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: (r.name as string) ?? "",
  }));
}

export async function getPaymentTemplateWithItems(
  templateId: string
): Promise<{ template: PaymentScheduleTemplate; items: PaymentScheduleTemplateItem[] } | null> {
  const c = client();
  const { data: templateRow, error: tErr } = await c
    .from("payment_schedule_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (tErr || !templateRow) {
    if (tErr && isMissingTable(tErr)) return null;
    return null;
  }
  const t = templateRow as Record<string, unknown>;
  const { data: itemRows, error: iErr } = await c
    .from("payment_schedule_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  if (iErr) {
    if (isMissingTable(iErr)) return null;
    return null;
  }
  const items = (itemRows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    templateId: r.template_id as string,
    sortOrder: Number(r.sort_order),
    title: (r.title as string) ?? "",
    amountType: (r.amount_type as "percent" | "fixed") ?? "percent",
    value: Number(r.value),
    dueRule: (r.due_rule as string) ?? "",
    notes: (r.notes as string) ?? null,
  }));
  return {
    template: { id: t.id as string, name: (t.name as string) ?? "" },
    items,
  };
}

export async function createPaymentTemplate(
  name: string,
  items: Array<{
    title: string;
    amountType: "percent" | "fixed";
    value: number;
    dueRule: string;
    notes?: string | null;
  }>
): Promise<PaymentScheduleTemplate | null> {
  const c = client();
  const { data: inserted, error: tErr } = await c
    .from("payment_schedule_templates")
    .insert({ name: name.trim() || "Payment template" })
    .select("id, name")
    .single();
  if (tErr) {
    if (isMissingTable(tErr)) return null;
    return null;
  }
  if (!inserted) return null;
  const t = inserted as Record<string, unknown>;
  const templateId = t.id as string;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const { error: iErr } = await c.from("payment_schedule_template_items").insert({
      template_id: templateId,
      sort_order: i,
      title: it.title,
      amount_type: it.amountType,
      value: it.value,
      due_rule: it.dueRule ?? "",
      notes: it.notes ?? null,
    });
    if (iErr && isMissingTable(iErr)) return null;
  }
  return { id: templateId, name: (t.name as string) ?? "" };
}

export async function applyPaymentTemplateToEstimate(
  estimateId: string,
  templateId: string
): Promise<boolean> {
  const data = await getPaymentTemplateWithItems(templateId);
  if (!data || data.items.length === 0) return false;
  const c = client();
  const { data: est } = await c.from("estimates").select("status").eq("id", estimateId).single();
  if (!est || !["Draft", "Sent"].includes(est.status as string)) return false;
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    await addPaymentMilestone(estimateId, {
      title: it.title,
      description: it.dueRule || it.notes || null,
      amount: it.amountType === "fixed" ? it.value : 0,
    });
  }
  return true;
}

// —— Status workflow ——

const ALLOWED_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  Draft: ["Sent"],
  Sent: ["Approved", "Rejected"],
  Approved: ["Converted"],
  Rejected: [],
  Converted: [],
};

export async function setEstimateStatus(
  estimateId: string,
  nextStatus: EstimateStatus
): Promise<boolean> {
  return applyEstimateStatusTransition(estimateId, nextStatus, client());
}

export async function setEstimateStatusWithClient(
  estimateId: string,
  nextStatus: EstimateStatus,
  db: SupabaseClient
): Promise<boolean> {
  return applyEstimateStatusTransition(estimateId, nextStatus, db);
}

async function applyEstimateStatusTransition(
  estimateId: string,
  nextStatus: EstimateStatus,
  c: SupabaseClient
): Promise<boolean> {
  const { data: est, error: fetchErr } = await c
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .single();
  if (fetchErr || !est) return false;
  const current = est.status as EstimateStatus;
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed?.includes(nextStatus)) return false;

  const now = new Date().toISOString().slice(0, 10);
  const updates: Record<string, unknown> = { status: nextStatus, updated_at: now };
  if (nextStatus === "Approved") updates.approved_at = now;

  const { error: updateErr } = await c.from("estimates").update(updates).eq("id", estimateId);
  return !updateErr;
}

/** Allow changing status to any value (e.g. correct a misclick). Sets/clears approved_at when switching to/from Approved. */
export async function updateEstimateStatus(
  estimateId: string,
  newStatus: EstimateStatus
): Promise<boolean> {
  return updateEstimateStatusWithClient(client(), estimateId, newStatus);
}

export async function updateEstimateStatusWithClient(
  c: SupabaseClient,
  estimateId: string,
  newStatus: EstimateStatus
): Promise<boolean> {
  const { data: est, error: fetchErr } = await c
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .single();
  if (fetchErr || !est) return false;

  const now = new Date().toISOString().slice(0, 10);
  const updates: Record<string, unknown> = { status: newStatus, updated_at: now };
  if (newStatus === "Approved") updates.approved_at = now;
  else if (est.status === "Approved") updates.approved_at = null;

  const { error: updateErr } = await c.from("estimates").update(updates).eq("id", estimateId);
  return !updateErr;
}

// —— Delete ——

export async function deleteEstimate(estimateId: string): Promise<boolean> {
  const c = client();
  const { error } = await c.from("estimates").delete().eq("id", estimateId);
  return !error;
}
