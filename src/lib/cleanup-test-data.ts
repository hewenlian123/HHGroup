/**
 * Clean test/demo data from the database in dependency order.
 * Only removes rows matching test/demo patterns; does not delete real production data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TEST_DATA_PATTERNS = [
  "Workflow Test",
  "Test",
  "Test Vendor",
  "Test Worker",
  "Test Project",
  "Example",
  "Demo",
  "Untitled",
];

export type CleanupResult = { deleted: Record<string, number>; errors: string[] };

function isMissingRelationOrColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find|column .* does not exist/i.test(m);
}

/** Return array of unique strings without using Set iteration (avoids downlevelIteration). */
function uniqueStrings(arr: string[]): string[] {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (!seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  }
  return out;
}

export async function cleanupTestData(c: SupabaseClient): Promise<CleanupResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  const addDeleted = (table: string, count: number) => {
    if (count > 0) deleted[table] = (deleted[table] ?? 0) + count;
  };

  const tryDelete = async (table: string, getIds: () => Promise<string[]>): Promise<boolean> => {
    try {
      const ids = await getIds();
      if (ids.length === 0) return true;
      const { error } = await c.from(table).delete().in("id", ids);
      if (error) {
        errors.push(`${table}: ${error.message}`);
        return false;
      }
      addDeleted(table, ids.length);
      return true;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const collectIdsByPatterns = async (
    table: string,
    column: string,
    patterns = TEST_DATA_PATTERNS
  ): Promise<string[]> => {
    const ids: string[] = [];
    for (const pattern of patterns) {
      const { data, error } = await c.from(table).select("id").ilike(column, `%${pattern}%`);
      if (error) {
        if (!isMissingRelationOrColumn(error)) errors.push(`${table}.${column}: ${error.message}`);
        continue;
      }
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  };

  const collectIdsByColumnValues = async (
    table: string,
    column: string,
    values: string[]
  ): Promise<string[]> => {
    const uniqueValues = uniqueStrings(values.filter(Boolean));
    if (uniqueValues.length === 0) return [];
    const { data, error } = await c.from(table).select("id").in(column, uniqueValues);
    if (error) {
      if (!isMissingRelationOrColumn(error)) errors.push(`${table}.${column}: ${error.message}`);
      return [];
    }
    return uniqueStrings((data ?? []).map((r: { id: string }) => r.id));
  };

  // Resolve test project and worker IDs once (before we delete projects/workers)
  let testProjectIds: string[] = [];
  let testWorkerIds: string[] = [];
  try {
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data: proj } = await c.from("projects").select("id").ilike("name", `%${pattern}%`);
      const { data: work } = await c.from("workers").select("id").ilike("name", `%${pattern}%`);
      testProjectIds = uniqueStrings([
        ...testProjectIds,
        ...(proj ?? []).map((r: { id: string }) => r.id),
      ]);
      testWorkerIds = uniqueStrings([
        ...testWorkerIds,
        ...(work ?? []).map((r: { id: string }) => r.id),
      ]);
    }
  } catch (e) {
    errors.push(`Resolve test ids: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 0. project_tasks — by is_test flag (bulk delete when migration has been applied)
  await tryDelete("project_tasks", async () => {
    const { data } = await c.from("project_tasks").select("id").eq("is_test", true);
    return (data ?? []).map((r: { id: string }) => r.id);
  });

  // 1. project_tasks — by title pattern
  await tryDelete("project_tasks", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("project_tasks").select("id").ilike("title", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 2. punch_list — by issue pattern
  await tryDelete("punch_list", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("punch_list").select("id").ilike("issue", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 3. project_schedule — by title pattern
  await tryDelete("project_schedule", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("project_schedule").select("id").ilike("title", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 4. site_photos — by description pattern
  await tryDelete("site_photos", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c
        .from("site_photos")
        .select("id")
        .ilike("description", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 5. inspection_log — by notes pattern
  await tryDelete("inspection_log", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("inspection_log").select("id").ilike("notes", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 6. project_change_orders — by title pattern (or similar column if different)
  await tryDelete("project_change_orders", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c
        .from("project_change_orders")
        .select("id")
        .ilike("title", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 7. worker_receipts — by test worker or test project
  if (testWorkerIds.length > 0 || testProjectIds.length > 0) {
    await tryDelete("worker_receipts", async () => {
      const ids: string[] = [];
      if (testWorkerIds.length > 0) {
        const { data } = await c
          .from("worker_receipts")
          .select("id")
          .in("worker_id", testWorkerIds);
        ids.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      if (testProjectIds.length > 0) {
        const { data } = await c
          .from("worker_receipts")
          .select("id")
          .in("project_id", testProjectIds);
        ids.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      return uniqueStrings(ids);
    });
  }

  // 8. worker_reimbursements — by notes pattern or test worker/project
  await tryDelete("worker_reimbursements", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c
        .from("worker_reimbursements")
        .select("id")
        .ilike("notes", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    if (testWorkerIds.length > 0) {
      const { data } = await c
        .from("worker_reimbursements")
        .select("id")
        .in("worker_id", testWorkerIds);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    if (testProjectIds.length > 0) {
      const { data } = await c
        .from("worker_reimbursements")
        .select("id")
        .in("project_id", testProjectIds);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 9. worker_payments — by test worker
  if (testWorkerIds.length > 0) {
    await tryDelete("worker_payments", async () => {
      const { data } = await c.from("worker_payments").select("id").in("worker_id", testWorkerIds);
      return (data ?? []).map((r: { id: string }) => r.id);
    });
  }

  // 10. labor_entries — by test worker or test project
  if (testWorkerIds.length > 0 || testProjectIds.length > 0) {
    await tryDelete("labor_entries", async () => {
      const ids: string[] = [];
      if (testWorkerIds.length > 0) {
        const { data } = await c.from("labor_entries").select("id").in("worker_id", testWorkerIds);
        ids.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      if (testProjectIds.length > 0) {
        const { data: dataPid } = await c
          .from("labor_entries")
          .select("id")
          .in("project_id", testProjectIds);
        const { data: dataAm } = await c
          .from("labor_entries")
          .select("id")
          .in("project_am_id", testProjectIds);
        const { data: dataPm } = await c
          .from("labor_entries")
          .select("id")
          .in("project_pm_id", testProjectIds);
        ids.push(...(dataPid ?? []).map((r: { id: string }) => r.id));
        ids.push(...(dataAm ?? []).map((r: { id: string }) => r.id));
        ids.push(...(dataPm ?? []).map((r: { id: string }) => r.id));
      }
      return uniqueStrings(ids);
    });
  }

  // 11. expense_lines — where expense has test vendor (get expense ids first)
  const testExpenseIds: string[] = [];
  for (const pattern of TEST_DATA_PATTERNS) {
    const { data } = await c.from("expenses").select("id").ilike("vendor_name", `%${pattern}%`);
    testExpenseIds.push(...(data ?? []).map((r: { id: string }) => r.id));
  }
  const uniqueExpenseIds = uniqueStrings(testExpenseIds);
  if (uniqueExpenseIds.length > 0) {
    await tryDelete("expense_lines", async () => {
      const { data } = await c
        .from("expense_lines")
        .select("id")
        .in("expense_id", uniqueExpenseIds);
      return (data ?? []).map((r: { id: string }) => r.id);
    });
  }

  // 12. expenses — by vendor_name pattern
  await tryDelete("expenses", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("expenses").select("id").ilike("vendor_name", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  const testInvoiceIds = uniqueStrings([
    ...(await collectIdsByPatterns("invoices", "client_name")),
    ...(await collectIdsByPatterns("invoices", "customer_name")),
    ...(await collectIdsByPatterns("invoices", "invoice_no")),
    ...(await collectIdsByPatterns("invoices", "notes")),
  ]);
  const testPaymentReceivedIds = uniqueStrings([
    ...(await collectIdsByPatterns("payments_received", "customer_name")),
    ...(await collectIdsByColumnValues("payments_received", "invoice_id", testInvoiceIds)),
  ]);

  // 13. deposits — by linked test payments/invoices (before payments_received / invoices)
  await tryDelete("deposits", async () =>
    uniqueStrings([
      ...(await collectIdsByColumnValues("deposits", "payment_id", testPaymentReceivedIds)),
      ...(await collectIdsByColumnValues("deposits", "invoice_id", testInvoiceIds)),
    ])
  );

  // 14. payments_received — by test customer name or linked test invoice
  await tryDelete("payments_received", async () => testPaymentReceivedIds);

  // 15. invoice_payments — linked test invoices
  await tryDelete("invoice_payments", async () =>
    collectIdsByColumnValues("invoice_payments", "invoice_id", testInvoiceIds)
  );

  // 16. invoice_items — linked test invoices
  await tryDelete("invoice_items", async () =>
    collectIdsByColumnValues("invoice_items", "invoice_id", testInvoiceIds)
  );

  // 17. invoices — by client_name/customer_name/invoice_no/notes pattern
  await tryDelete("invoices", async () => testInvoiceIds);

  // 18. estimates — by client pattern
  await tryDelete("estimates", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("estimates").select("id").ilike("client", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 19. material_catalog — by material_name pattern
  await tryDelete("material_catalog", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c
        .from("material_catalog")
        .select("id")
        .ilike("material_name", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 20. activity_logs — by description pattern or test project (before deleting projects)
  await tryDelete("activity_logs", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c
        .from("activity_logs")
        .select("id")
        .ilike("description", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    if (testProjectIds.length > 0) {
      const { data } = await c.from("activity_logs").select("id").in("project_id", testProjectIds);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 21. projects — by name pattern
  await tryDelete("projects", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("projects").select("id").ilike("name", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  // 22. workers — by name pattern
  await tryDelete("workers", async () => {
    const ids: string[] = [];
    for (const pattern of TEST_DATA_PATTERNS) {
      const { data } = await c.from("workers").select("id").ilike("name", `%${pattern}%`);
      ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
    return uniqueStrings(ids);
  });

  return { deleted, errors };
}
