/**
 * Playwright / E2E database cleanup: only rows matching test patterns.
 * Preserves supabase/seed.sql fixed UUID rows (staging seed project/worker/customer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

/** Seed.sql fixed IDs — never delete these rows. */
export const E2E_PRESERVED_PROJECT_ID = "11111111-1111-1111-1111-111111111111";

/** Display name in Quick expense / project Select (matches seed upsert). */
export const E2E_PRESERVED_PROJECT_LABEL = "[E2E] Seed — HH Unified";
export const E2E_PRESERVED_WORKER_ID = "22222222-2222-2222-2222-222222222222";
export const E2E_PRESERVED_CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";
/** Fixed labor row for worker-payment E2E (unpaid, same project as seed). */
export const E2E_PRESERVED_LABOR_ENTRY_ID = "66666666-6666-6666-6666-666666666661";

/**
 * ILIKE substrings for messy Playwright data.
 * (Also use `PW ` / `[E2E]` prefixes in tests per project rules.)
 */
export const E2E_TEST_SUBSTRINGS = ["%PW%", "%Playwright%", "%Workflow Test%", "%Body balance%"];

export type CleanupTestDataResult = {
  deleted: Record<string, number>;
  warnings: string[];
};

/** Receipt queue rows created only by Playwright (file_name patterns). */
/** Narrow prefixes — avoid `queue-%` (matches `queue-multi-*` while those rows are still under test). */
const E2E_RECEIPT_QUEUE_FILE_PATTERNS = [
  "queue-receipt-%",
  "queue-validate-%",
  "queue-enter-%",
  "queue-shift-%",
  "queue-multi-%",
  "receipt-layout-%",
  "rq-%",
] as const;

/** Delete E2E receipt_queue rows so failed specs do not accumulate and starve the UI. */
export async function purgeE2EReceiptQueueRows(supabase: SupabaseClient): Promise<number> {
  assertE2ESupabaseUrlSafeForMutations(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const seen = new Set<string>();
  for (const p of E2E_RECEIPT_QUEUE_FILE_PATTERNS) {
    const { data, error } = await supabase.from("receipt_queue").select("id").ilike("file_name", p);
    if (error || !data?.length) continue;
    for (const r of data as { id: string }[]) {
      if (r.id) seen.add(r.id);
    }
  }
  const ids = Array.from(seen);
  if (ids.length === 0) return 0;
  const { error: delErr } = await supabase.from("receipt_queue").delete().in("id", ids);
  if (delErr) {
    console.warn("[purgeE2EReceiptQueueRows]", delErr.message);
    return 0;
  }
  return ids.length;
}

function uniqueIds(ids: string[]): string[] {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  for (const id of ids) {
    if (id && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
}

async function collectIdsByIlike(
  c: SupabaseClient,
  table: string,
  column: string,
  patterns: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const p of patterns) {
    const { data, error } = await c.from(table).select("id").ilike(column, p);
    if (error) continue;
    for (const row of data ?? []) ids.push((row as { id: string }).id);
  }
  return uniqueIds(ids);
}

async function collectInvoiceIdsForCleanup(c: SupabaseClient): Promise<string[]> {
  const ids = await collectIdsByIlike(c, "invoices", "client_name", E2E_TEST_SUBSTRINGS);
  const { data: e2eInvoices } = await c.from("invoices").select("id").like("client_name", "[E2E]%");
  for (const row of e2eInvoices ?? []) ids.push((row as { id: string }).id);
  return uniqueIds(ids);
}

async function collectProjectIdsForCleanup(c: SupabaseClient): Promise<string[]> {
  const ids = await collectIdsByIlike(c, "projects", "name", [
    ...E2E_TEST_SUBSTRINGS,
    "%Overlord%",
  ]);
  const { data: e2eProjects } = await c.from("projects").select("id").like("name", "[E2E]%");
  for (const row of e2eProjects ?? []) {
    const r = row as { id: string };
    if (r.id !== E2E_PRESERVED_PROJECT_ID) ids.push(r.id);
  }
  return uniqueIds(ids.filter((id) => id !== E2E_PRESERVED_PROJECT_ID));
}

async function collectCustomerIdsForCleanup(c: SupabaseClient): Promise<string[]> {
  const ids = await collectIdsByIlike(c, "customers", "name", E2E_TEST_SUBSTRINGS);
  const { data: e2eCust } = await c.from("customers").select("id").like("name", "[E2E]%");
  for (const row of e2eCust ?? []) {
    const r = row as { id: string };
    if (r.id !== E2E_PRESERVED_CUSTOMER_ID) ids.push(r.id);
  }
  return uniqueIds(ids.filter((id) => id !== E2E_PRESERVED_CUSTOMER_ID));
}

/**
 * Delete Playwright / E2E test rows. Safe for repeated runs.
 * Invoices use column **`client_name`** (not `client`).
 */
export async function cleanupTestData(supabase: SupabaseClient): Promise<CleanupTestDataResult> {
  assertE2ESupabaseUrlSafeForMutations(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const deleted: Record<string, number> = {};
  const warnings: string[] = [];
  const bump = (table: string, n: number) => {
    if (n > 0) deleted[table] = (deleted[table] ?? 0) + n;
  };

  const invoiceIds = await collectInvoiceIdsForCleanup(supabase);
  if (invoiceIds.length > 0) {
    const { data: payRows } = await supabase
      .from("invoice_payments")
      .select("id")
      .in("invoice_id", invoiceIds);
    const payIds = (payRows ?? []).map((r: { id: string }) => r.id);
    if (payIds.length > 0) {
      const { error } = await supabase.from("invoice_payments").delete().in("id", payIds);
      if (error) warnings.push(`invoice_payments: ${error.message}`);
      else bump("invoice_payments", payIds.length);
    }
    const { error: invErr } = await supabase.from("invoices").delete().in("id", invoiceIds);
    if (invErr) warnings.push(`invoices: ${invErr.message}`);
    else bump("invoices", invoiceIds.length);
  }

  const { data: allPay } = await supabase.from("invoice_payments").select("id, invoice_id");
  const { data: allInv } = await supabase.from("invoices").select("id");
  const validInv = new Set((allInv ?? []).map((r: { id: string }) => r.id));
  const orphanPayIds = (allPay ?? [])
    .filter((r: { invoice_id: string | null }) => r.invoice_id && !validInv.has(r.invoice_id))
    .map((r: { id: string }) => r.id);
  if (orphanPayIds.length > 0) {
    const { error } = await supabase.from("invoice_payments").delete().in("id", orphanPayIds);
    if (error) warnings.push(`invoice_payments orphan: ${error.message}`);
    else bump("invoice_payments", orphanPayIds.length);
  }

  const laborIds: string[] = [];
  for (const p of E2E_TEST_SUBSTRINGS) {
    const { data } = await supabase
      .from("labor_entries")
      .select("id, project_id")
      .ilike("notes", p);
    for (const row of data ?? []) {
      const r = row as { id: string; project_id: string | null };
      if (r.project_id !== E2E_PRESERVED_PROJECT_ID) laborIds.push(r.id);
    }
  }
  const { data: leNotesE2e } = await supabase
    .from("labor_entries")
    .select("id, project_id")
    .ilike("notes", "%[E2E]%");
  for (const row of leNotesE2e ?? []) {
    const r = row as { id: string; project_id: string | null };
    if (r.project_id !== E2E_PRESERVED_PROJECT_ID) laborIds.push(r.id);
  }
  const { data: leCost } = await supabase
    .from("labor_entries")
    .select("id, project_id")
    .eq("cost_code", "[E2E]");
  for (const row of leCost ?? []) {
    const r = row as { id: string; project_id: string | null };
    if (r.project_id !== E2E_PRESERVED_PROJECT_ID) laborIds.push(r.id);
  }
  const uLabor = uniqueIds(laborIds);
  if (uLabor.length > 0) {
    const { error } = await supabase.from("labor_entries").delete().in("id", uLabor);
    if (error) warnings.push(`labor_entries: ${error.message}`);
    else bump("labor_entries", uLabor.length);
  }

  const photoIds: string[] = [];
  for (const p of E2E_TEST_SUBSTRINGS) {
    const { data } = await supabase
      .from("site_photos")
      .select("id, project_id")
      .ilike("description", p);
    for (const row of data ?? []) {
      const r = row as { id: string; project_id: string | null };
      if (r.project_id !== E2E_PRESERVED_PROJECT_ID) photoIds.push(r.id);
    }
  }
  const { data: phE2e } = await supabase
    .from("site_photos")
    .select("id, project_id")
    .like("description", "[E2E]%");
  for (const row of phE2e ?? []) {
    const r = row as { id: string; project_id: string | null };
    if (r.project_id !== E2E_PRESERVED_PROJECT_ID) photoIds.push(r.id);
  }
  const uPhoto = uniqueIds(photoIds);
  if (uPhoto.length > 0) {
    const { error } = await supabase.from("site_photos").delete().in("id", uPhoto);
    if (error) warnings.push(`site_photos: ${error.message}`);
    else bump("site_photos", uPhoto.length);
  }

  const docIds: string[] = [];
  for (const p of E2E_TEST_SUBSTRINGS) {
    const { data } = await supabase
      .from("documents")
      .select("id, project_id")
      .ilike("file_name", p);
    for (const row of data ?? []) {
      const r = row as { id: string; project_id: string | null };
      if (r.project_id !== E2E_PRESERVED_PROJECT_ID) docIds.push(r.id);
    }
  }
  const { data: docE2e } = await supabase
    .from("documents")
    .select("id, project_id")
    .like("file_name", "[E2E]%");
  for (const row of docE2e ?? []) {
    const r = row as { id: string; project_id: string | null };
    if (r.project_id !== E2E_PRESERVED_PROJECT_ID) docIds.push(r.id);
  }
  const uDoc = uniqueIds(docIds);
  if (uDoc.length > 0) {
    const { error } = await supabase.from("documents").delete().in("id", uDoc);
    if (error) warnings.push(`documents: ${error.message}`);
    else bump("documents", uDoc.length);
  }

  const commissionIds: string[] = [];
  for (const p of E2E_TEST_SUBSTRINGS) {
    const { data } = await supabase.from("commissions").select("id").ilike("person_name", p);
    for (const row of data ?? []) {
      const r = row as { id: string };
      commissionIds.push(r.id);
    }
    const { data: notesData } = await supabase.from("commissions").select("id").ilike("notes", p);
    for (const row of notesData ?? []) {
      const r = row as { id: string };
      commissionIds.push(r.id);
    }
  }
  const { data: commissionNameE2e } = await supabase
    .from("commissions")
    .select("id")
    .ilike("person_name", "%[E2E]%");
  for (const row of commissionNameE2e ?? []) {
    const r = row as { id: string };
    commissionIds.push(r.id);
  }
  const { data: commissionNotesE2e } = await supabase
    .from("commissions")
    .select("id")
    .ilike("notes", "%[E2E]%");
  for (const row of commissionNotesE2e ?? []) {
    const r = row as { id: string };
    commissionIds.push(r.id);
  }
  const uCommission = uniqueIds(commissionIds);
  if (uCommission.length > 0) {
    const { data: paymentRows } = await supabase
      .from("commission_payments")
      .select("id")
      .in("commission_id", uCommission);
    const paymentIds = (paymentRows ?? []).map((r: { id: string }) => r.id);
    if (paymentIds.length > 0) {
      const { error } = await supabase.from("commission_payments").delete().in("id", paymentIds);
      if (error) warnings.push(`commission_payments: ${error.message}`);
      else bump("commission_payments", paymentIds.length);
    }
    const { error } = await supabase.from("commissions").delete().in("id", uCommission);
    if (error) warnings.push(`commissions: ${error.message}`);
    else bump("commissions", uCommission.length);
  }

  const projectIds = await collectProjectIdsForCleanup(supabase);
  if (projectIds.length > 0) {
    const { error } = await supabase.from("projects").delete().in("id", projectIds);
    if (error) warnings.push(`projects: ${error.message}`);
    else bump("projects", projectIds.length);
  }

  const customerIds = await collectCustomerIdsForCleanup(supabase);
  if (customerIds.length > 0) {
    const { error } = await supabase.from("customers").delete().in("id", customerIds);
    if (error) warnings.push(`customers: ${error.message}`);
    else bump("customers", customerIds.length);
  }

  /** Playwright expenses / receipt-queue specs (vendor_name prefixes). */
  const e2eExpenseVendorPrefixes = [
    "E2E-QE-%",
    "E2E-RQ-%",
    "E2E-PV-%",
    "E2E-UP-%",
    "E2E-QP-%",
    "E2E-HD-%",
    "E2E-ED-%",
  ];
  const e2eExpenseIdSet = new Set<string>();
  for (const pattern of e2eExpenseVendorPrefixes) {
    const { data: byVendorName } = await supabase
      .from("expenses")
      .select("id")
      .ilike("vendor_name", pattern);
    for (const row of byVendorName ?? []) e2eExpenseIdSet.add((row as { id: string }).id);
    const { data: byVendor } = await supabase
      .from("expenses")
      .select("id")
      .ilike("vendor", pattern);
    for (const row of byVendor ?? []) e2eExpenseIdSet.add((row as { id: string }).id);
  }
  const e2eExpenseIds = Array.from(e2eExpenseIdSet).filter(Boolean);
  if (e2eExpenseIds.length > 0) {
    const { data: attRows } = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", "expense")
      .in("entity_id", e2eExpenseIds);
    const attIds = (attRows ?? []).map((r: { id: string }) => r.id);
    if (attIds.length > 0) {
      const { error: aErr } = await supabase.from("attachments").delete().in("id", attIds);
      if (aErr) warnings.push(`attachments (e2e vendor expenses): ${aErr.message}`);
      else bump("attachments", attIds.length);
    }
    const { error: unlinkErr } = await supabase
      .from("bank_transactions")
      .update({ linked_expense_id: null })
      .in("linked_expense_id", e2eExpenseIds);
    if (unlinkErr) warnings.push(`bank_transactions unlink e2e expenses: ${unlinkErr.message}`);
    const { data: lineRows } = await supabase
      .from("expense_lines")
      .select("id")
      .in("expense_id", e2eExpenseIds);
    const lineDelCount = (lineRows ?? []).length;
    const { error: lineErr } = await supabase
      .from("expense_lines")
      .delete()
      .in("expense_id", e2eExpenseIds);
    if (lineErr) warnings.push(`expense_lines (e2e vendor expenses): ${lineErr.message}`);
    else if (lineDelCount > 0) bump("expense_lines", lineDelCount);
    const { error: expErr } = await supabase.from("expenses").delete().in("id", e2eExpenseIds);
    if (expErr) warnings.push(`expenses (e2e vendor cleanup): ${expErr.message}`);
    else bump("expenses", e2eExpenseIds.length);
  }

  const rqPurged = await purgeE2EReceiptQueueRows(supabase);
  if (rqPurged > 0) bump("receipt_queue", rqPurged);

  return { deleted, warnings };
}
