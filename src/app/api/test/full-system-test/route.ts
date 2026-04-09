import { NextResponse } from "next/server";
import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";
import { markInvoiceSent } from "@/lib/invoices-db";
import { createPaymentReceived } from "@/lib/payments-received-db";
import { createWorkerPaymentWithClient } from "@/lib/worker-payments-db";
import { insertLaborEntryForTestSchema } from "@/lib/labor-entry-test-insert";
import postgres from "postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type TestResult = { name: string; ok: boolean; steps: string[] };

function log(test: string, step: string) {
  if (typeof console !== "undefined" && console.log)
    console.log(`[full-system-test] ${test}: ${step}`);
}

/** Serialize caught value to a string for steps/messages (avoids [object Object]). */
function toErrorString(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (
    e != null &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  )
    return (e as { message: string }).message;
  return JSON.stringify(e);
}

const TEST_IDS = [
  "workers_crud",
  "projects_crud",
  "receipts_crud",
  "receipt_actions_workflow",
  "reimbursements_workflow",
  "expenses_crud",
  "invoice_payment_workflow",
  "labor_workflow",
  "estimates_crud",
  "customers_crud",
  "change_orders_crud",
  "tasks_crud",
  "punch_list_crud",
  "schedule_crud",
  "site_photos_crud",
  "inspection_log_crud",
  "material_catalog_crud",
] as const;

type TestId = (typeof TEST_IDS)[number];

/**
 * POST /api/test/full-system-test
 * Body: { only?: TestId }
 * Returns: { ok, tests: [{ name, ok, steps }] }
 *
 * All test data is tagged "Workflow Test" and cleaned up after each test.
 * Tests are independent — each creates and deletes its own rows.
 */
export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  let only: TestId | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.only && (TEST_IDS as readonly string[]).includes(body.only))
      only = body.only as TestId;
  } catch {
    /* ignore */
  }

  // Prefer service role so RLS does not block test data creation (workers, receipts, etc.)
  const c = getServerSupabaseAdmin() ?? getServerSupabase();
  if (!c) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase not configured. Set SUPABASE_SERVICE_ROLE_KEY or anon key.",
        tests: [],
      },
      { status: 500 }
    );
  }

  const tests: TestResult[] = [];
  const run = (id: TestId) => !only || only === id;
  /** Worker/project IDs created by reimbursement-related tests (receipt_actions_workflow, reimbursements_workflow) for final cleanup. */
  const testCreatedWorkerIds = new Set<string>();
  const testCreatedProjectIds = new Set<string>();

  // Required tables that must exist before running tests (detect missing migration/schema cache)
  const REQUIRED_TABLES = [
    "projects",
    "workers",
    "customers",
    "worker_receipts",
    "expenses",
    "invoices",
    "activity_logs",
    "estimates",
    "project_change_orders",
    "project_tasks",
    "punch_list",
    "project_schedule",
    "site_photos",
    "inspection_log",
    "material_catalog",
  ] as const;
  const missingTables: string[] = [];
  for (const table of REQUIRED_TABLES) {
    const { error } = await c.from(table).select("id").limit(1).maybeSingle();
    const msg = (error as { message?: string } | null)?.message ?? "";
    if (
      error &&
      /relation.*does not exist|table.*does not exist|could not find.*schema cache/i.test(msg)
    ) {
      missingTables.push(table);
    }
  }
  if (missingTables.length > 0) {
    tests.push({
      name: "required_tables",
      ok: false,
      steps: [
        `Missing tables: ${missingTables.join(", ")}. Run migrations or reload Supabase schema cache.`,
      ],
    });
    log("required_tables", `missing: ${missingTables.join(", ")}`);
    return NextResponse.json({
      ok: false,
      message: `Required tables missing: ${missingTables.join(", ")}`,
      tests,
    });
  }

  /** Safe delete — Supabase builder is PromiseLike but not a full Promise, so no .catch() */
  async function safeDelete(table: string, id: string) {
    try {
      await c!.from(table).delete().eq("id", id);
    } catch {
      /* ignore */
    }
  }

  /** Delete a worker_reimbursement by id using admin client; if 0 rows deleted, try direct SQL so the row is actually removed. */
  async function deleteWorkerReimbursementById(id: string) {
    const { data, error } = await c!
      .from("worker_reimbursements")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) log("cleanup", `worker_reimbursements delete error: ${error.message}`);
    const deleted = (data ?? []).length;
    if (deleted > 0) return;
    const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
        try {
          await sql`DELETE FROM public.worker_reimbursements WHERE id = ${id}::uuid`;
        } finally {
          await sql.end();
        }
      } catch (e) {
        log("cleanup", `worker_reimbursements direct SQL delete failed: ${toErrorString(e)}`);
      }
    }
  }

  /** Detect "table not found" / schema cache errors and return a clear message for test results. */
  function tableMissingMessage(table: string, err: unknown): string {
    const msg = toErrorString(err);
    if (/relation.*does not exist|table.*does not exist|could not find.*schema cache/i.test(msg))
      return `Table '${table}' not found. Run migrations or reload Supabase schema cache.`;
    return msg;
  }

  function isSchemaOrMissingColumn(msg: string): boolean {
    return /could not find the .* column|column .* does not exist|schema cache/i.test(msg);
  }

  /** Call an API route the same way the UI does. Returns parsed JSON or throws. */
  async function callApi(
    method: "POST" | "DELETE" | "PATCH",
    path: string,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        (data as { message?: string }).message ?? `${method} ${path} → ${res.status}`
      );
    return data as Record<string, unknown>;
  }

  // ── 1. Workers CRUD ──────────────────────────────────────────────────────
  if (run("workers_crud")) {
    log("workers_crud", "start");
    const steps: string[] = [];
    let workerId: string | null = null;
    try {
      // Create — omit daily_rate/half_day_rate; may not be in schema cache
      const { data: created, error: createErr } = await c
        .from("workers")
        .insert({ name: "Workflow Test Worker", role: "Test", status: "active" })
        .select("id, name, role")
        .single();
      if (createErr || !created) throw new Error(`Create failed: ${createErr?.message}`);
      workerId = (created as { id: string }).id;
      steps.push("worker created");
      log("workers_crud", `created id=${workerId}`);

      // Update
      const { error: updateErr } = await c
        .from("workers")
        .update({ role: "Test Updated" })
        .eq("id", workerId);
      if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);
      steps.push("worker updated");
      log("workers_crud", "updated");

      // Fetch & verify
      const { data: fetched, error: fetchErr } = await c
        .from("workers")
        .select("id, role")
        .eq("id", workerId)
        .maybeSingle();
      if (fetchErr || !fetched)
        throw new Error(`Fetch failed: ${fetchErr?.message ?? "not found"}`);
      if ((fetched as { role?: string }).role !== "Test Updated")
        throw new Error("Update not reflected on fetch");
      steps.push("worker fetched and verified");
      log("workers_crud", "fetched and verified");

      // Delete
      const { error: deleteErr } = await c.from("workers").delete().eq("id", workerId);
      if (deleteErr) throw new Error(`Delete failed: ${deleteErr.message}`);
      workerId = null;
      steps.push("worker deleted");
      log("workers_crud", "deleted");

      tests.push({ name: "workers_crud", ok: true, steps });
    } catch (e) {
      if (workerId) await safeDelete("workers", workerId);
      const err = toErrorString(e);
      log("workers_crud", `error: ${err}`);
      tests.push({ name: "workers_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 2. Projects CRUD ─────────────────────────────────────────────────────
  if (run("projects_crud")) {
    log("projects_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    try {
      // Create
      const { data: created, error: createErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Project", status: "active", budget: 1000 })
        .select("id, name, status")
        .single();
      if (createErr || !created) throw new Error(`Create failed: ${createErr?.message}`);
      projectId = (created as { id: string }).id;
      steps.push("project created");
      log("projects_crud", `created id=${projectId}`);

      // Update
      const { error: updateErr } = await c
        .from("projects")
        .update({ status: "completed" })
        .eq("id", projectId);
      if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);
      steps.push("project updated");
      log("projects_crud", "updated");

      // Fetch & verify
      const { data: fetched, error: fetchErr } = await c
        .from("projects")
        .select("id, status")
        .eq("id", projectId)
        .maybeSingle();
      if (fetchErr || !fetched)
        throw new Error(`Fetch failed: ${fetchErr?.message ?? "not found"}`);
      if ((fetched as { status?: string }).status !== "completed")
        throw new Error("Update not reflected on fetch");
      steps.push("project fetched and verified");
      log("projects_crud", "fetched and verified");

      // Delete
      const { error: deleteErr } = await c.from("projects").delete().eq("id", projectId);
      if (deleteErr) throw new Error(`Delete failed: ${deleteErr.message}`);
      projectId = null;
      steps.push("project deleted");
      log("projects_crud", "deleted");

      tests.push({ name: "projects_crud", ok: true, steps });
    } catch (e) {
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("projects_crud", `error: ${err}`);
      tests.push({ name: "projects_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 3. Customers CRUD + links ────────────────────────────────────────────
  if (run("customers_crud")) {
    log("customers_crud", "start");
    const steps: string[] = [];
    let customerId: string | null = null;
    try {
      // Create
      const { data: created, error: createErr } = await c
        .from("customers")
        .insert({ name: "Workflow Test Customer", notes: "Workflow Test" })
        .select("id, name")
        .single();
      if (createErr || !created) throw new Error(`Create failed: ${createErr?.message}`);
      customerId = (created as { id: string }).id;
      steps.push("customer created");
      log("customers_crud", `created id=${customerId}`);

      // Read
      const { data: fetched, error: fetchErr } = await c
        .from("customers")
        .select("id, name")
        .eq("id", customerId)
        .maybeSingle();
      if (fetchErr || !fetched)
        throw new Error(`Fetch failed: ${fetchErr?.message ?? "not found"}`);
      steps.push("customer fetched");

      // Update
      const { error: updateErr } = await c
        .from("customers")
        .update({ name: "Workflow Test Customer Updated" })
        .eq("id", customerId);
      if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);
      steps.push("customer updated");

      // Verify update
      const { data: updated, error: verifyErr } = await c
        .from("customers")
        .select("id, name")
        .eq("id", customerId)
        .maybeSingle();
      if (verifyErr || !updated)
        throw new Error(`Verify failed: ${verifyErr?.message ?? "not found"}`);
      if ((updated as { name?: string }).name !== "Workflow Test Customer Updated") {
        throw new Error("Update not reflected on fetch");
      }
      steps.push("customer verified");

      // Link checks: projects.customer_id and estimates.customer_id columns exist
      {
        const { error: projErr } = await c
          .from("projects")
          .select("id, customer_id")
          .limit(1)
          .maybeSingle();
        if (projErr) throw new Error(tableMissingMessage("projects.customer_id", projErr));
        steps.push("projects.customer_id column ok");
      }
      {
        const { error: estErr } = await c
          .from("estimates")
          .select("id, customer_id")
          .limit(1)
          .maybeSingle();
        if (estErr) throw new Error(tableMissingMessage("estimates.customer_id", estErr));
        steps.push("estimates.customer_id column ok");
      }

      // Delete
      const { error: deleteErr } = await c.from("customers").delete().eq("id", customerId);
      if (deleteErr) throw new Error(`Delete failed: ${deleteErr.message}`);
      customerId = null;
      steps.push("customer deleted");
      log("customers_crud", "deleted");

      tests.push({ name: "customers_crud", ok: true, steps });
    } catch (e) {
      if (customerId) await safeDelete("customers", customerId);
      const err = toErrorString(e);
      log("customers_crud", `error: ${err}`);
      tests.push({ name: "customers_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 3. Worker Receipts CRUD ───────────────────────────────────────────────
  if (run("receipts_crud")) {
    log("receipts_crud", "start");
    const steps: string[] = [];
    let receiptId: string | null = null;
    let receiptId2: string | null = null;
    try {
      // Create (Pending)
      const { data: created, error: createErr } = await c
        .from("worker_receipts")
        .insert({
          worker_name: "Workflow Test Worker",
          expense_type: "Other",
          amount: 50,
          status: "Pending",
        })
        .select("id, status")
        .single();
      if (createErr || !created) throw new Error(`Create failed: ${createErr?.message}`);
      receiptId = (created as { id: string }).id;
      steps.push("receipt created (Pending)");
      log("receipts_crud", `created id=${receiptId}`);

      // Approve
      const { data: approved, error: approveErr } = await c
        .from("worker_receipts")
        .update({ status: "Approved" })
        .eq("id", receiptId)
        .select("id, status")
        .single();
      if (approveErr || !approved) throw new Error(`Approve failed: ${approveErr?.message}`);
      if ((approved as { status?: string }).status !== "Approved")
        throw new Error("Status not updated to Approved");
      steps.push("receipt approved");
      log("receipts_crud", "approved");

      // Create second receipt for rejection test
      const { data: created2, error: createErr2 } = await c
        .from("worker_receipts")
        .insert({
          worker_name: "Workflow Test Worker",
          expense_type: "Other",
          amount: 25,
          status: "Pending",
        })
        .select("id, status")
        .single();
      if (createErr2 || !created2) throw new Error(`Create2 failed: ${createErr2?.message}`);
      receiptId2 = (created2 as { id: string }).id;

      // Reject
      const { data: rejected, error: rejectErr } = await c
        .from("worker_receipts")
        .update({ status: "Rejected", rejection_reason: "Workflow Test rejection" })
        .eq("id", receiptId2)
        .select("id, status")
        .single();
      if (rejectErr || !rejected) throw new Error(`Reject failed: ${rejectErr?.message}`);
      if ((rejected as { status?: string }).status !== "Rejected")
        throw new Error("Status not updated to Rejected");
      steps.push("second receipt rejected");
      log("receipts_crud", "rejected");

      // Delete both
      await c.from("worker_receipts").delete().eq("id", receiptId);
      await c.from("worker_receipts").delete().eq("id", receiptId2);
      receiptId = null;
      receiptId2 = null;
      steps.push("receipts deleted");
      log("receipts_crud", "deleted");

      tests.push({ name: "receipts_crud", ok: true, steps });
    } catch (e) {
      if (receiptId) await safeDelete("worker_receipts", receiptId);
      if (receiptId2) await safeDelete("worker_receipts", receiptId2);
      const err = toErrorString(e);
      log("receipts_crud", `error: ${err}`);
      tests.push({ name: "receipts_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 4. Receipt Actions Workflow (via real API routes) ─────────────────────
  if (run("receipt_actions_workflow")) {
    log("receipt_actions_workflow", "start");
    const steps: string[] = [];
    let receiptId: string | null = null;
    let reimbId: string | null = null;
    let workflowWorkerId: string | null = null;
    try {
      // 0. Create a worker so approve can resolve by name
      const { data: workflowWorker, error: workerErr } = await c
        .from("workers")
        .insert({ name: "Workflow Test Receipt", status: "active" })
        .select("id")
        .single();
      if (workerErr || !workflowWorker)
        throw new Error(`Worker create failed: ${workerErr?.message}`);
      workflowWorkerId = (workflowWorker as { id: string }).id;
      testCreatedWorkerIds.add(workflowWorkerId);
      steps.push("worker created for receipt");

      // 1. Create receipt directly in DB (same as UI form POST)
      const { data: created, error: createErr } = await c
        .from("worker_receipts")
        .insert({
          worker_id: workflowWorkerId,
          worker_name: "Workflow Test Receipt",
          expense_type: "Other",
          amount: 75,
          status: "Pending",
        })
        .select("id, status")
        .single();
      if (createErr || !created) throw new Error(`Create failed: ${createErr?.message}`);
      receiptId = (created as { id: string }).id;
      steps.push("receipt created (Pending)");
      log("receipt_actions_workflow", `created id=${receiptId}`);

      // 2. Approve via the real API route (same as UI "Approve" button)
      const approveData = await callApi("POST", `/api/worker-receipts/${receiptId}/approve`);
      const approvedReceipt = approveData.receipt as { status?: string } | null;
      if (approvedReceipt?.status !== "Approved")
        throw new Error(`Approve: expected status=Approved, got ${approvedReceipt?.status}`);
      steps.push("receipt approved via API");
      log("receipt_actions_workflow", "approved");

      // 3. Verify reimbursement was created
      const reimb = approveData.reimbursementCreated as { id?: string } | boolean | null;
      if (!reimb)
        throw new Error("Approve API did not create a reimbursement (reimbursementCreated=false)");
      reimbId = typeof reimb === "object" && reimb !== null ? (reimb.id ?? null) : null;
      if (!reimbId) {
        // reimbursementCreated may just be `true` without the id; look it up
        const { data: reimbRow } = await c
          .from("worker_reimbursements")
          .select("id")
          .eq("receipt_id", receiptId)
          .maybeSingle();
        reimbId = (reimbRow as { id?: string } | null)?.id ?? null;
      }
      steps.push(`reimbursement created (id=${reimbId ?? "confirmed"})`);
      log("receipt_actions_workflow", `reimbursement id=${reimbId}`);

      // 4. Reset receipt back to Pending via the real API route
      const resetData = await callApi("POST", `/api/worker-receipts/${receiptId}/reset-pending`);
      const resetReceipt = resetData.receipt as { status?: string } | null;
      if (resetReceipt?.status !== "Pending")
        throw new Error(`Reset: expected status=Pending, got ${resetReceipt?.status}`);
      steps.push("receipt reset to Pending via API");
      log("receipt_actions_workflow", "reset to pending");

      // 5. Reject via the real API route (same as UI "Reject" button)
      const rejectData = await callApi("POST", `/api/worker-receipts/${receiptId}/reject`, {
        reason: "Workflow Test rejection",
      });
      const rejectedReceipt = rejectData.receipt as { status?: string } | null;
      if (rejectedReceipt?.status !== "Rejected")
        throw new Error(`Reject: expected status=Rejected, got ${rejectedReceipt?.status}`);
      steps.push("receipt rejected via API");
      log("receipt_actions_workflow", "rejected");

      // 6. Delete via the real API route (same as UI "Delete" button)
      const deletedId = receiptId;
      await callApi("DELETE", `/api/worker-receipts/${deletedId}`);
      steps.push("receipt deleted via API");
      log("receipt_actions_workflow", "deleted");
      receiptId = null;

      // 7. Verify receipt no longer exists
      const { data: gone } = await c
        .from("worker_receipts")
        .select("id")
        .eq("id", deletedId)
        .maybeSingle();
      if (gone) throw new Error("Receipt still exists after delete");
      steps.push("receipt confirmed deleted");
      log("receipt_actions_workflow", "confirmed deleted");

      // 8. Clean up workflow worker
      if (workflowWorkerId) {
        await c.from("workers").delete().eq("id", workflowWorkerId);
        workflowWorkerId = null;
      }
      steps.push("workflow worker deleted");

      tests.push({ name: "receipt_actions_workflow", ok: true, steps });
    } catch (e) {
      if (reimbId) await deleteWorkerReimbursementById(reimbId);
      if (receiptId) await safeDelete("worker_receipts", receiptId);
      if (workflowWorkerId) await safeDelete("workers", workflowWorkerId);
      const err = toErrorString(e);
      log("receipt_actions_workflow", `error: ${err}`);
      tests.push({ name: "receipt_actions_workflow", ok: false, steps: [...steps, err] });
    }
  }

  // ── 5. Reimbursements Workflow ────────────────────────────────────────────
  if (run("reimbursements_workflow")) {
    log("reimbursements_workflow", "start");
    const steps: string[] = [];
    let workerId: string | null = null;
    let receiptId: string | null = null;
    let reimbId: string | null = null;
    try {
      // Need a worker for the reimbursement FK — omit daily_rate; may not be in schema cache
      const { data: w, error: wErr } = await c
        .from("workers")
        .insert({ name: "Workflow Test Reimb Worker", status: "active" })
        .select("id")
        .single();
      if (wErr || !w) throw new Error(`Worker create failed: ${wErr?.message}`);
      workerId = (w as { id: string }).id;
      testCreatedWorkerIds.add(workerId);

      // Create receipt
      const { data: receipt, error: rErr } = await c
        .from("worker_receipts")
        .insert({
          worker_id: workerId,
          worker_name: "Workflow Test Reimb Worker",
          expense_type: "Other",
          amount: 75,
          status: "Pending",
        })
        .select("id")
        .single();
      if (rErr || !receipt) throw new Error(`Receipt create failed: ${rErr?.message}`);
      receiptId = (receipt as { id: string }).id;
      steps.push("receipt created");
      log("reimbursements_workflow", "receipt created");

      // Approve receipt → status = Approved
      await c.from("worker_receipts").update({ status: "Approved" }).eq("id", receiptId);
      steps.push("receipt approved");
      log("reimbursements_workflow", "receipt approved");

      // Create reimbursement (column set varies by migration)
      const todayReimb = new Date().toISOString().slice(0, 10);
      let reimbRes = await c
        .from("worker_reimbursements")
        .insert({
          worker_id: workerId,
          amount: 75,
          description: "Workflow Test reimbursement",
          status: "pending",
        })
        .select("id, status")
        .single();
      if (reimbRes.error && isSchemaOrMissingColumn(reimbRes.error.message ?? "")) {
        reimbRes = await c
          .from("worker_reimbursements")
          .insert({
            worker_id: workerId,
            amount: 75,
            notes: "Workflow Test reimbursement",
            reimbursement_date: todayReimb,
          })
          .select("id")
          .single();
      }
      const { data: reimb, error: reimbErr } = reimbRes;
      if (reimbErr || !reimb) throw new Error(`Reimbursement create failed: ${reimbErr?.message}`);
      reimbId = (reimb as { id: string }).id;
      steps.push("reimbursement created");
      log("reimbursements_workflow", "reimbursement created");

      // Link receipt → reimbursement
      await c.from("worker_receipts").update({ reimbursement_id: reimbId }).eq("id", receiptId);
      steps.push("receipt linked to reimbursement");

      // Mark reimbursement paid (paid_at may not exist on all schemas)
      let paidRes = await c
        .from("worker_reimbursements")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", reimbId)
        .select("id, status")
        .single();
      if (paidRes.error && isSchemaOrMissingColumn(paidRes.error.message ?? "")) {
        paidRes = await c
          .from("worker_reimbursements")
          .update({ status: "paid" })
          .eq("id", reimbId)
          .select("id, status")
          .single();
      }
      const { data: paid, error: paidErr } = paidRes;
      if (paidErr || !paid) throw new Error(`Mark paid failed: ${paidErr?.message}`);
      const st = String((paid as { status?: string }).status ?? "").toLowerCase();
      if (st !== "paid")
        throw new Error(`Status not updated to paid (got ${(paid as { status?: string }).status})`);
      steps.push("reimbursement marked paid");
      log("reimbursements_workflow", "marked paid");

      // Cleanup
      await deleteWorkerReimbursementById(reimbId);
      reimbId = null;
      await safeDelete("worker_receipts", receiptId);
      receiptId = null;
      await safeDelete("workers", workerId);
      workerId = null;
      steps.push("cleanup done");
      log("reimbursements_workflow", "cleanup done");

      tests.push({ name: "reimbursements_workflow", ok: true, steps });
    } catch (e) {
      if (reimbId) await deleteWorkerReimbursementById(reimbId);
      if (receiptId) await safeDelete("worker_receipts", receiptId);
      if (workerId) await safeDelete("workers", workerId);
      const err = toErrorString(e);
      log("reimbursements_workflow", `error: ${err}`);
      tests.push({ name: "reimbursements_workflow", ok: false, steps: [...steps, err] });
    }
  }

  // ── 5. Expenses CRUD ──────────────────────────────────────────────────────
  if (run("expenses_crud")) {
    log("expenses_crud", "start");
    const steps: string[] = [];
    let expenseId: string | null = null;
    let lineId: string | null = null;
    try {
      // Create expense
      const { data: created, error: createErr } = await c
        .from("expenses")
        .insert({
          expense_date: new Date().toISOString().slice(0, 10),
          vendor_name: "Workflow Test Vendor",
          amount: 100,
          total: 100,
          line_count: 0,
        })
        .select("id, vendor_name, total")
        .single();
      if (createErr || !created) throw new Error(`Expense create failed: ${createErr?.message}`);
      expenseId = (created as { id: string }).id;
      steps.push("expense created");
      log("expenses_crud", `created expense id=${expenseId}`);

      // Create expense line
      const linePayload: Record<string, unknown> = {
        expense_id: expenseId,
        description: "Workflow Test Line",
        amount: 100,
        total: 100,
      };
      const { data: line, error: lineErr } = await c
        .from("expense_lines")
        .insert(linePayload)
        .select("id")
        .single();
      if (!lineErr && line) {
        lineId = (line as { id: string }).id;
        steps.push("expense line created");
        log("expenses_crud", `created line id=${lineId}`);
      } else {
        // expense_lines may not exist — non-fatal
        steps.push("expense line skipped (table may not exist)");
        log("expenses_crud", `line skipped: ${lineErr?.message}`);
      }

      // Update expense
      const { error: updateErr } = await c
        .from("expenses")
        .update({
          vendor_name: "Workflow Test Vendor Updated",
          amount: 120,
          total: 120,
        })
        .eq("id", expenseId);
      if (updateErr) throw new Error(`Expense update failed: ${updateErr.message}`);
      steps.push("expense updated");
      log("expenses_crud", "updated");

      // Fetch & verify
      const { data: fetched, error: fetchErr } = await c
        .from("expenses")
        .select("id, vendor_name")
        .eq("id", expenseId)
        .maybeSingle();
      if (fetchErr || !fetched)
        throw new Error(`Fetch failed: ${fetchErr?.message ?? "not found"}`);
      if ((fetched as { vendor_name?: string }).vendor_name !== "Workflow Test Vendor Updated")
        throw new Error("Update not reflected on fetch");
      steps.push("expense fetched and verified");
      log("expenses_crud", "fetched and verified");

      // Delete line then expense
      if (lineId) {
        await safeDelete("expense_lines", lineId);
        lineId = null;
        steps.push("expense line deleted");
      }
      const { error: deleteErr } = await c.from("expenses").delete().eq("id", expenseId);
      if (deleteErr) throw new Error(`Expense delete failed: ${deleteErr.message}`);
      expenseId = null;
      steps.push("expense deleted");
      log("expenses_crud", "deleted");

      tests.push({ name: "expenses_crud", ok: true, steps });
    } catch (e) {
      if (lineId) await safeDelete("expense_lines", lineId);
      if (expenseId) await safeDelete("expenses", expenseId);
      const err = toErrorString(e);
      log("expenses_crud", `error: ${err}`);
      tests.push({ name: "expenses_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 6. Invoice Payment Workflow ───────────────────────────────────────────
  if (run("invoice_payment_workflow")) {
    log("invoice_payment_workflow", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let invoiceId: string | null = null;
    let paymentId: string | null = null;
    try {
      // Need a project
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Invoice Project", status: "active", budget: 5000 })
        .select("id")
        .single();
      if (projErr || !proj) throw new Error(`Project create failed: ${projErr?.message}`);
      projectId = (proj as { id: string }).id;

      // Create invoice
      const today = new Date().toISOString().slice(0, 10);
      const { data: inv, error: invErr } = await c
        .from("invoices")
        .insert({
          project_id: projectId,
          invoice_no: `WFTEST-${Date.now()}`,
          client_name: "Workflow Test Client",
          issue_date: today,
          due_date: today,
          status: "Draft",
          subtotal: 300,
          total: 300,
          tax_pct: 0,
          tax_amount: 0,
        })
        .select("id, status, total")
        .single();
      if (invErr || !inv) throw new Error(`Invoice create failed: ${invErr?.message}`);
      invoiceId = (inv as { id: string }).id;
      steps.push("invoice created");
      log("invoice_payment_workflow", `invoice id=${invoiceId}`);

      // Mark sent so computedStatus can move past Draft
      await markInvoiceSent(invoiceId).catch(() => null);
      steps.push("invoice marked sent");
      log("invoice_payment_workflow", "marked sent");

      // Receive partial payment via app layer (syncs to invoice_payments + deposits)
      const payment = await createPaymentReceived({
        invoice_id: invoiceId,
        project_id: projectId,
        customer_name: "Workflow Test Client",
        payment_date: today,
        amount: 150,
        payment_method: "Check",
      });
      paymentId = payment.id;
      steps.push("payment received");
      log("invoice_payment_workflow", `payment id=${paymentId} amount=150`);

      // Verify payment was stored
      const { data: storedPayment } = await c
        .from("payments_received")
        .select("id, amount")
        .eq("id", paymentId)
        .maybeSingle();
      if (!storedPayment) throw new Error("Payment not found after insert");
      if (Number((storedPayment as { amount?: number }).amount) < 1)
        throw new Error("Payment amount incorrect");
      steps.push("payment verified");
      log("invoice_payment_workflow", "payment verified");

      // Cleanup
      await safeDelete("payments_received", paymentId);
      paymentId = null;
      await safeDelete("invoices", invoiceId);
      invoiceId = null;
      await safeDelete("projects", projectId);
      projectId = null;
      steps.push("cleanup done");
      log("invoice_payment_workflow", "cleanup done");

      tests.push({ name: "invoice_payment_workflow", ok: true, steps });
    } catch (e) {
      if (paymentId) await safeDelete("payments_received", paymentId);
      if (invoiceId) await safeDelete("invoices", invoiceId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("invoice_payment_workflow", `error: ${err}`);
      tests.push({ name: "invoice_payment_workflow", ok: false, steps: [...steps, err] });
    }
  }

  // ── 7. Labor Workflow ─────────────────────────────────────────────────────
  if (run("labor_workflow")) {
    log("labor_workflow", "start");
    const steps: string[] = [];
    let workerId: string | null = null;
    let projectId: string | null = null;
    let laborId: string | null = null;
    let paymentId: string | null = null;
    try {
      // Create worker
      const { data: w, error: wErr } = await c
        .from("workers")
        .insert({ name: "Workflow Test Labor Worker", status: "active" })
        .select("id")
        .single();
      if (wErr || !w) throw new Error(`Worker create failed: ${wErr?.message}`);
      workerId = (w as { id: string }).id;

      // labor_entries.worker_id FK references labor_workers(id), not workers(id).
      // The trigger syncs workers → labor_workers, but may not have run yet.
      // Upsert directly to guarantee the row exists before the labor entry insert.
      await c
        .from("labor_workers")
        .upsert({ id: workerId, name: "Workflow Test Labor Worker" }, { onConflict: "id" });

      // Create project
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Labor Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj) throw new Error(`Project create failed: ${projErr?.message}`);
      projectId = (proj as { id: string }).id;

      // Create labor entry (schema varies by migration — try multiple shapes)
      const today = new Date().toISOString().slice(0, 10);
      const labor = await insertLaborEntryForTestSchema(c!, {
        workerId,
        projectId,
        workDate: today,
      });
      laborId = labor.id;
      steps.push("labor entry created");
      log("labor_workflow", `labor entry id=${laborId}`);

      // Verify labor entry was stored
      const { data: storedLabor } = await c
        .from("labor_entries")
        .select("id")
        .eq("id", laborId)
        .maybeSingle();
      if (!storedLabor) throw new Error("Labor entry not found after insert");
      steps.push("labor entry verified");
      log("labor_workflow", "labor entry verified");

      // Create worker payment (handles legacy column names: amount vs total_amount, note vs notes)
      const payment = await createWorkerPaymentWithClient(c, {
        workerId,
        amount: 50,
        paymentMethod: "Test",
        notes: "full-system-test",
      });
      paymentId = payment.id;
      steps.push("worker payment created");
      log("labor_workflow", `worker payment id=${paymentId}`);

      // Verify payment stored
      let storedPayment: { total_amount?: number; amount?: number } | null = null;
      {
        const a = await c
          .from("worker_payments")
          .select("id, total_amount")
          .eq("id", paymentId)
          .maybeSingle();
        if (!a.error && a.data) storedPayment = a.data as { total_amount?: number };
        else {
          const b = await c
            .from("worker_payments")
            .select("id, amount")
            .eq("id", paymentId)
            .maybeSingle();
          if (!b.error && b.data) storedPayment = b.data as { amount?: number };
        }
      }
      if (!storedPayment) throw new Error("Worker payment not found after insert");
      const payAmt = Number(
        (storedPayment as { total_amount?: number; amount?: number }).total_amount ??
          (storedPayment as { amount?: number }).amount
      );
      if (payAmt < 1) throw new Error("Worker payment amount incorrect");
      steps.push("worker payment verified");
      log("labor_workflow", "worker payment verified");

      // Cleanup
      await safeDelete("worker_payments", paymentId);
      paymentId = null;
      await safeDelete("labor_entries", laborId);
      laborId = null;
      await safeDelete("projects", projectId);
      projectId = null;
      await safeDelete("labor_workers", workerId);
      await safeDelete("workers", workerId);
      workerId = null;
      steps.push("cleanup done");
      log("labor_workflow", "cleanup done");

      tests.push({ name: "labor_workflow", ok: true, steps });
    } catch (e) {
      if (paymentId) await safeDelete("worker_payments", paymentId);
      if (laborId) await safeDelete("labor_entries", laborId);
      if (projectId) await safeDelete("projects", projectId);
      if (workerId) await safeDelete("labor_workers", workerId);
      if (workerId) await safeDelete("workers", workerId);
      const err = toErrorString(e);
      log("labor_workflow", `error: ${err}`);
      tests.push({ name: "labor_workflow", ok: false, steps: [...steps, err] });
    }
  }

  // ── 8. Estimates CRUD ────────────────────────────────────────────────────
  if (run("estimates_crud")) {
    log("estimates_crud", "start");
    const steps: string[] = [];
    let estimateId: string | null = null;
    try {
      const { data: created, error: createErr } = await c
        .from("estimates")
        .insert({
          number: `WFTEST-E-${Date.now()}`,
          client: "Workflow Test Client",
          project: "Workflow Test Project",
          status: "Draft",
        })
        .select("id, number, status")
        .single();
      if (createErr || !created)
        throw new Error(createErr ? tableMissingMessage("estimates", createErr) : "Create failed");
      estimateId = (created as { id: string }).id;
      steps.push("estimate created");
      const { data: fetched, error: fetchErr } = await c
        .from("estimates")
        .select("id, status")
        .eq("id", estimateId)
        .maybeSingle();
      if (fetchErr || !fetched)
        throw new Error(
          `Read failed: ${(fetchErr as { message?: string })?.message ?? "not found"}`
        );
      steps.push("estimate read ok");
      await c.from("estimates").delete().eq("id", estimateId);
      estimateId = null;
      steps.push("estimate deleted");
      tests.push({ name: "estimates_crud", ok: true, steps });
    } catch (e) {
      if (estimateId) await safeDelete("estimates", estimateId);
      const err = toErrorString(e);
      log("estimates_crud", `error: ${err}`);
      tests.push({ name: "estimates_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 9. Change Orders CRUD ─────────────────────────────────────────────────
  if (run("change_orders_crud")) {
    log("change_orders_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let changeOrderId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test CO Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("project_change_orders")
        .insert({ project_id: projectId, number: "WFTEST-CO-1", status: "Draft", total: 0 })
        .select("id, number, status")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("project_change_orders", createErr) : "Create failed"
        );
      changeOrderId = (created as { id: string }).id;
      steps.push("change order created");
      const { error: fetchErr } = await c
        .from("project_change_orders")
        .select("id")
        .eq("id", changeOrderId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("change order read ok");
      await c.from("project_change_orders").delete().eq("id", changeOrderId);
      changeOrderId = null;
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("change order and project deleted");
      tests.push({ name: "change_orders_crud", ok: true, steps });
    } catch (e) {
      if (changeOrderId) await safeDelete("project_change_orders", changeOrderId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("change_orders_crud", `error: ${err}`);
      tests.push({ name: "change_orders_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 10. Tasks CRUD ───────────────────────────────────────────────────────
  if (run("tasks_crud")) {
    log("tasks_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let taskId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Tasks Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("project_tasks")
        .insert({
          project_id: projectId,
          title: "Workflow Test Task",
          status: "todo",
          is_test: true,
        })
        .select("id, title, status")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("project_tasks", createErr) : "Create failed"
        );
      taskId = (created as { id: string }).id;
      steps.push("task created");
      const { error: fetchErr } = await c
        .from("project_tasks")
        .select("id")
        .eq("id", taskId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("task read ok");
      const deletedTaskId = taskId;
      await c.from("project_tasks").delete().eq("id", deletedTaskId);
      taskId = null;
      steps.push("task deleted (test cleanup)");
      const { data: afterRow } = await c
        .from("project_tasks")
        .select("id")
        .eq("id", deletedTaskId)
        .maybeSingle();
      if (afterRow) throw new Error("Task still exists after delete");
      steps.push("task removed from DB");
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("project cleaned up");
      tests.push({ name: "tasks_crud", ok: true, steps });
    } catch (e) {
      if (taskId) await safeDelete("project_tasks", taskId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("tasks_crud", `error: ${err}`);
      tests.push({ name: "tasks_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 11. Punch List CRUD ───────────────────────────────────────────────────
  if (run("punch_list_crud")) {
    log("punch_list_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let punchId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Punch Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("punch_list")
        .insert({ project_id: projectId, issue: "Workflow Test Issue", status: "open" })
        .select("id, issue, status")
        .single();
      if (createErr || !created)
        throw new Error(createErr ? tableMissingMessage("punch_list", createErr) : "Create failed");
      punchId = (created as { id: string }).id;
      steps.push("punch list item created");
      const { error: fetchErr } = await c
        .from("punch_list")
        .select("id")
        .eq("id", punchId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("punch list read ok");
      await c.from("punch_list").delete().eq("id", punchId);
      punchId = null;
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("punch list item and project deleted");
      tests.push({ name: "punch_list_crud", ok: true, steps });
    } catch (e) {
      if (punchId) await safeDelete("punch_list", punchId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("punch_list_crud", `error: ${err}`);
      tests.push({ name: "punch_list_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 12. Schedule CRUD ──────────────────────────────────────────────────────
  if (run("schedule_crud")) {
    log("schedule_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let scheduleId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Schedule Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("project_schedule")
        .insert({ project_id: projectId, title: "Workflow Test Schedule", status: "scheduled" })
        .select("id, title, status")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("project_schedule", createErr) : "Create failed"
        );
      scheduleId = (created as { id: string }).id;
      steps.push("schedule item created");
      const { error: fetchErr } = await c
        .from("project_schedule")
        .select("id")
        .eq("id", scheduleId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("schedule read ok");
      await c.from("project_schedule").delete().eq("id", scheduleId);
      scheduleId = null;
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("schedule item and project deleted");
      tests.push({ name: "schedule_crud", ok: true, steps });
    } catch (e) {
      if (scheduleId) await safeDelete("project_schedule", scheduleId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("schedule_crud", `error: ${err}`);
      tests.push({ name: "schedule_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 13. Site Photos CRUD ──────────────────────────────────────────────────
  if (run("site_photos_crud")) {
    log("site_photos_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let photoId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Photos Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("site_photos")
        .insert({ project_id: projectId, photo_url: "https://example.com/wftest-placeholder.jpg" })
        .select("id, photo_url")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("site_photos", createErr) : "Create failed"
        );
      photoId = (created as { id: string }).id;
      steps.push("site photo created");
      const { error: fetchErr } = await c
        .from("site_photos")
        .select("id")
        .eq("id", photoId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("site photo read ok");
      await c.from("site_photos").delete().eq("id", photoId);
      photoId = null;
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("site photo and project deleted");
      tests.push({ name: "site_photos_crud", ok: true, steps });
    } catch (e) {
      if (photoId) await safeDelete("site_photos", photoId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("site_photos_crud", `error: ${err}`);
      tests.push({ name: "site_photos_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 14. Inspection Log CRUD ───────────────────────────────────────────────
  if (run("inspection_log_crud")) {
    log("inspection_log_crud", "start");
    const steps: string[] = [];
    let projectId: string | null = null;
    let inspectionId: string | null = null;
    try {
      const { data: proj, error: projErr } = await c
        .from("projects")
        .insert({ name: "Workflow Test Inspection Project", status: "active" })
        .select("id")
        .single();
      if (projErr || !proj)
        throw new Error(
          projErr ? tableMissingMessage("projects", projErr) : "Project create failed"
        );
      projectId = (proj as { id: string }).id;
      const { data: created, error: createErr } = await c
        .from("inspection_log")
        .insert({ project_id: projectId, inspection_type: "Workflow Test", status: "pending" })
        .select("id, inspection_type, status")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("inspection_log", createErr) : "Create failed"
        );
      inspectionId = (created as { id: string }).id;
      steps.push("inspection log entry created");
      const { error: fetchErr } = await c
        .from("inspection_log")
        .select("id")
        .eq("id", inspectionId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("inspection log read ok");
      await c.from("inspection_log").delete().eq("id", inspectionId);
      inspectionId = null;
      await c.from("projects").delete().eq("id", projectId);
      projectId = null;
      steps.push("inspection log entry and project deleted");
      tests.push({ name: "inspection_log_crud", ok: true, steps });
    } catch (e) {
      if (inspectionId) await safeDelete("inspection_log", inspectionId);
      if (projectId) await safeDelete("projects", projectId);
      const err = toErrorString(e);
      log("inspection_log_crud", `error: ${err}`);
      tests.push({ name: "inspection_log_crud", ok: false, steps: [...steps, err] });
    }
  }

  // ── 15. Material Catalog CRUD ──────────────────────────────────────────────
  if (run("material_catalog_crud")) {
    log("material_catalog_crud", "start");
    const steps: string[] = [];
    let catalogId: string | null = null;
    try {
      const { data: created, error: createErr } = await c
        .from("material_catalog")
        .insert({ category: "Workflow Test", material_name: "Workflow Test Material" })
        .select("id, category, material_name")
        .single();
      if (createErr || !created)
        throw new Error(
          createErr ? tableMissingMessage("material_catalog", createErr) : "Create failed"
        );
      catalogId = (created as { id: string }).id;
      steps.push("material catalog item created");
      const { error: fetchErr } = await c
        .from("material_catalog")
        .select("id")
        .eq("id", catalogId)
        .maybeSingle();
      if (fetchErr) throw new Error(`Read failed: ${(fetchErr as { message?: string })?.message}`);
      steps.push("material catalog read ok");
      await c.from("material_catalog").delete().eq("id", catalogId);
      catalogId = null;
      steps.push("material catalog item deleted");
      tests.push({ name: "material_catalog_crud", ok: true, steps });
    } catch (e) {
      if (catalogId) await safeDelete("material_catalog", catalogId);
      const err = toErrorString(e);
      log("material_catalog_crud", `error: ${err}`);
      tests.push({ name: "material_catalog_crud", ok: false, steps: [...steps, err] });
    }
  }

  // Final cleanup: remove any worker_reimbursements rows created by this test run (by test worker/project ids or test description)
  try {
    const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (dbUrl && (testCreatedWorkerIds.size > 0 || testCreatedProjectIds.size > 0)) {
      const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
      try {
        if (testCreatedWorkerIds.size > 0) {
          const workerIds = Array.from(testCreatedWorkerIds);
          await sql`DELETE FROM public.worker_reimbursements WHERE worker_id IN ${sql(workerIds)}`;
        }
        if (testCreatedProjectIds.size > 0) {
          const projectIds = Array.from(testCreatedProjectIds);
          await sql`DELETE FROM public.worker_reimbursements WHERE project_id IN ${sql(projectIds)}`;
        }
      } finally {
        await sql.end();
      }
    } else {
      if (testCreatedWorkerIds.size > 0) {
        const workerIds = Array.from(testCreatedWorkerIds);
        const { error: e1 } = await c
          .from("worker_reimbursements")
          .delete()
          .in("worker_id", workerIds);
        if (e1) log("cleanup", `final worker_reimbursements by worker_id failed: ${e1.message}`);
      }
      if (testCreatedProjectIds.size > 0) {
        const projectIds = Array.from(testCreatedProjectIds);
        const { error: e2 } = await c
          .from("worker_reimbursements")
          .delete()
          .in("project_id", projectIds);
        if (e2) log("cleanup", `final worker_reimbursements by project_id failed: ${e2.message}`);
      }
    }
    // Orphaned test rows (e.g. worker already deleted): delete by exact test descriptions
    const { error: e3 } = await c
      .from("worker_reimbursements")
      .delete()
      .eq("description", "Workflow Test reimbursement");
    if (e3) log("cleanup", `final worker_reimbursements by description failed: ${e3.message}`);
    // receipt_actions_workflow approve creates reimbursement with description "Other" and amount 75
    const { error: e4 } = await c
      .from("worker_reimbursements")
      .delete()
      .eq("description", "Other")
      .eq("amount", 75);
    if (e4)
      log("cleanup", `final worker_reimbursements by description Other failed: ${e4.message}`);
  } catch (e) {
    log("cleanup", `final worker_reimbursements cleanup failed: ${toErrorString(e)}`);
  }

  const allOk = tests.every((t) => t.ok);
  return NextResponse.json({ ok: allOk, tests });
}
