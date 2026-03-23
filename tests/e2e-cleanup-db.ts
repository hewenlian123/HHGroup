/**
 * Playwright / E2E database cleanup: only rows matching test patterns.
 * Preserves supabase/seed.sql fixed UUID rows (staging seed project/worker/customer).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Seed.sql fixed IDs — never delete these rows. */
export const E2E_PRESERVED_PROJECT_ID = "11111111-1111-1111-1111-111111111111";
export const E2E_PRESERVED_WORKER_ID = "22222222-2222-2222-2222-222222222222";
export const E2E_PRESERVED_CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";

/**
 * ILIKE substrings for messy Playwright data.
 * (Also use `PW ` / `[E2E]` prefixes in tests per project rules.)
 */
export const E2E_TEST_SUBSTRINGS = ["%PW%", "%Playwright%", "%Workflow Test%", "%Body balance%"];

export type CleanupTestDataResult = {
  deleted: Record<string, number>;
  warnings: string[];
};

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

  return { deleted, warnings };
}
