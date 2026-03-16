/**
 * Wipe all data from main tables for production reset.
 * Does NOT drop tables or schema — only DELETE. Tables are cleared in dependency-safe order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WipeResult = { deleted: Record<string, number>; errors: string[] };

/** Tables to wipe in dependency order (children before parents). Uses 'id' for match-all unless noted. */
const WIPE_ORDER: { table: string; keyColumn?: string }[] = [
  { table: "commission_payment_records" },
  { table: "project_commissions" },
  { table: "expense_lines" },
  { table: "expenses" },
  { table: "labor_entries" },
  { table: "worker_receipts" },
  { table: "worker_reimbursements" },
  { table: "worker_payments" },
  { table: "invoice_payments" },
  { table: "invoice_items" },
  { table: "deposits" },
  { table: "payments_received" },
  { table: "invoices" },
  { table: "site_photos" },
  { table: "project_budget_items" },
  { table: "project_change_order_items" },
  { table: "project_change_order_attachments" },
  { table: "project_change_orders" },
  { table: "project_tasks" },
  { table: "punch_list" },
  { table: "project_material_selections" },
  { table: "project_schedule" },
  { table: "inspection_log" },
  { table: "activity_logs" },
  { table: "estimate_meta", keyColumn: "estimate_id" },
  { table: "estimate_items" },
  { table: "estimate_categories", keyColumn: "estimate_id" },
  { table: "estimate_snapshots" },
  { table: "estimates" },
  { table: "material_catalog" },
  { table: "projects" },
  { table: "labor_workers" },
  { table: "workers" },
];

/** Match-all filter: column != nil UUID so every row matches. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function wipeAllData(c: SupabaseClient): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  for (const { table, keyColumn = "id" } of WIPE_ORDER) {
    try {
      const { data, error } = await c
        .from(table)
        .delete()
        .neq(keyColumn as "id", NIL_UUID)
        .select(keyColumn);
      if (error) {
        const msg = error.message ?? "";
        if (/relation.*does not exist|table.*does not exist|could not find the table/i.test(msg)) continue;
        errors.push(`${table}: ${msg}`);
        continue;
      }
      const n = (data ?? []).length;
      if (n > 0) deleted[table] = n;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { deleted, errors };
}
