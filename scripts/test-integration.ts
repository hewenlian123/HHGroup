/**
 * End-to-end integration test runner (manual, not CI):
 *
 * Usage:
 *   cd hh-unified-web
 *   npx tsx scripts/test-integration.ts
 *
 * Requires .env.local with SUPABASE_DATABASE_URL or DATABASE_URL.
 * Uses the same business logic / tables as the app; only orchestrates flows.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

type FlowResult = { name: string; ok: boolean; steps: string[] };

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
}

function toError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("FAIL: Missing SUPABASE_DATABASE_URL or DATABASE_URL in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  const results: FlowResult[] = [];

  // Helpers
  const markName = (base: string) => `${base} (Integration Test)`;

  // 1. CUSTOMER → PROJECT → TASK
  {
    const steps: string[] = [];
    let customerId: string | null = null;
    let projectId: string | null = null;
    let taskId: string | null = null;
    try {
      const customerName = markName("Flow1 Customer");
      const [cRow] = await sql<{ id: string }[]>`
        insert into customers (name, notes)
        values (${customerName}, 'integration_test')
        returning id
      `;
      customerId = cRow.id;
      steps.push("customer created");

      const projectName = markName("Flow1 Project");
      const [pRow] = await sql<{ id: string }[]>`
        insert into projects (name, status, budget, customer_id)
        values (${projectName}, 'active', 1000, ${customerId}::uuid)
        returning id
      `;
      projectId = pRow.id;
      steps.push("project created and linked to customer");

      const [tRow] = await sql<{ id: string }[]>`
        insert into project_tasks (project_id, title, status, is_test)
        values (${projectId}::uuid, 'Flow1 Task', 'todo', true)
        returning id
      `;
      taskId = tRow.id;
      steps.push("task created");

      const [pCheck] = await sql<{ customer_id: string | null }[]>`
        select customer_id from projects where id = ${projectId}::uuid
      `;
      if (!pCheck || pCheck.customer_id !== customerId) {
        throw new Error("Project.customer_id does not match created customer");
      }
      steps.push("project shows correct customer_id");

      await sql`delete from project_tasks where id = ${taskId}::uuid`;
      steps.push("task deleted");
      await sql`delete from projects where id = ${projectId}::uuid`;
      steps.push("project deleted");
      await sql`delete from customers where id = ${customerId}::uuid`;
      steps.push("customer deleted");

      results.push({ name: "Flow1 CUSTOMER → PROJECT → TASK", ok: true, steps });
    } catch (e) {
      if (taskId) await sql`delete from project_tasks where id = ${taskId}::uuid`;
      if (projectId) await sql`delete from projects where id = ${projectId}::uuid`;
      if (customerId) await sql`delete from customers where id = ${customerId}::uuid`;
      steps.push(`ERROR: ${toError(e)}`);
      results.push({ name: "Flow1 CUSTOMER → PROJECT → TASK", ok: false, steps });
    }
  }

  // 2. PROJECT → DAILY ENTRY → WORKER BALANCE
  {
    const steps: string[] = [];
    let projectId: string | null = null;
    let workerId: string | null = null;
    let laborEntryId: string | null = null;
    try {
      const projectName = markName("Flow2 Project");
      const [pRow] = await sql<{ id: string }[]>`
        insert into projects (name, status, budget)
        values (${projectName}, 'active', 1000)
        returning id
      `;
      projectId = pRow.id;
      steps.push("project created");

      const workerName = markName("Flow2 Worker");
      const [wRow] = await sql<{ id: string }[]>`
        insert into workers (name, role, half_day_rate, status)
        values (${workerName}, 'Test', 100, 'active')
        returning id
      `;
      workerId = wRow.id;
      steps.push("worker created (workers)");

      // Keep labor_workers in sync for FK on labor_entries.worker_id.
      await sql`
        insert into labor_workers (id, name, type, rate, active)
        values (${workerId}::uuid, ${workerName}, 'worker', 200, true)
      `;
      steps.push("worker mirrored into labor_workers");

      // Half-day (AM only) → base pay = 100
      const halfDayHours = 4;
      const hourlyRate = 200 / 8;
      const costAmount = halfDayHours * hourlyRate;
      const today = new Date().toISOString().slice(0, 10);
      const [leRow] = await sql<{ id: string }[]>`
        insert into labor_entries (worker_id, project_id, work_date, hours, cost_amount, status)
        values (${workerId}::uuid, ${projectId}::uuid, ${today}::date, ${halfDayHours}, ${costAmount}, 'unpaid')
        returning id
      `;
      laborEntryId = leRow.id;
      steps.push("labor entry created (half day)");

      // Aggregate from labor_entries as Worker Balances API does.
      const [agg] = await sql<{ labor_owed: string | number | null }[]>`
        select coalesce(sum(cost_amount),0) as labor_owed
        from labor_entries
        where worker_id = ${workerId}::uuid
          and coalesce(lower(status),'') <> 'paid'
      `;
      const laborOwed = Number(agg?.labor_owed ?? 0);
      if (Math.abs(laborOwed - costAmount) > 0.01) {
        throw new Error(`Labor owed mismatch: expected ${costAmount}, got ${laborOwed}`);
      }
      steps.push("worker balance labor_owed matches labor_entries");

      await sql`delete from labor_entries where id = ${laborEntryId}::uuid`;
      steps.push("labor entry deleted");
      await sql`delete from workers where id = ${workerId}::uuid`;
      steps.push("worker deleted");
      await sql`delete from projects where id = ${projectId}::uuid`;
      steps.push("project deleted");

      results.push({
        name: "Flow2 PROJECT → DAILY ENTRY → WORKER BALANCE",
        ok: true,
        steps,
      });
    } catch (e) {
      if (laborEntryId) await sql`delete from labor_entries where id = ${laborEntryId}::uuid`;
      if (workerId) await sql`delete from workers where id = ${workerId}::uuid`;
      if (projectId) await sql`delete from projects where id = ${projectId}::uuid`;
      steps.push(`ERROR: ${toError(e)}`);
      results.push({
        name: "Flow2 PROJECT → DAILY ENTRY → WORKER BALANCE",
        ok: false,
        steps,
      });
    }
  }

  // 3. PROJECT → EXPENSE → FINANCIAL
  {
    const steps: string[] = [];
    let projectId: string | null = null;
    let expenseId: string | null = null;
    try {
      const projectName = markName("Flow3 Project");
      const [pRow] = await sql<{ id: string }[]>`
        insert into projects (name, status, budget, spent)
        values (${projectName}, 'active', 0, 0)
        returning id
      `;
      projectId = pRow.id;
      steps.push("project created");

      const amount = 150;
      const [eRow] = await sql<{ id: string }[]>`
        insert into expenses (project_id, amount, status, notes)
        values (${projectId}::uuid, ${amount}, 'approved', 'Integration Test Expense')
        returning id
      `;
      expenseId = eRow.id;
      steps.push("expense created");

      // Financial overview typically uses canonicalProfit / expenses; here we only check that
      // expenses table reflects amount for this project.
      const [agg] = await sql<{ total: string | number | null }[]>`
        select coalesce(sum(amount),0) as total
        from expenses
        where project_id = ${projectId}::uuid
          and status = 'approved'
      `;
      const spent = Number(agg?.total ?? 0);
      if (Math.abs(spent - amount) > 0.01) {
        throw new Error(`Project spent mismatch from expenses: expected ${amount}, got ${spent}`);
      }
      steps.push("project spent reflects expense amount (via expenses)");

      await sql`delete from expenses where id = ${expenseId}::uuid`;
      steps.push("expense deleted");
      await sql`delete from projects where id = ${projectId}::uuid`;
      steps.push("project deleted");

      results.push({
        name: "Flow3 PROJECT → EXPENSE → FINANCIAL",
        ok: true,
        steps,
      });
    } catch (e) {
      if (expenseId) await sql`delete from expenses where id = ${expenseId}::uuid`;
      if (projectId) await sql`delete from projects where id = ${projectId}::uuid`;
      steps.push(`ERROR: ${toError(e)}`);
      results.push({
        name: "Flow3 PROJECT → EXPENSE → FINANCIAL",
        ok: false,
        steps,
      });
    }
  }

  // 4. CUSTOMER → ESTIMATE
  {
    const steps: string[] = [];
    let customerId: string | null = null;
    let estimateId: string | null = null;
    try {
      const customerName = markName("Flow4 Customer");
      const [cRow] = await sql<{ id: string }[]>`
        insert into customers (name, notes)
        values (${customerName}, 'integration_test')
        returning id
      `;
      customerId = cRow.id;
      steps.push("customer created");

      const [eRow] = await sql<{ id: string }[]>`
        insert into estimates (number, client, project, status, customer_id)
        values ('INT-TEST', ${customerName}, 'Flow4 Project', 'Draft', ${customerId}::uuid)
        returning id
      `;
      estimateId = eRow.id;
      steps.push("estimate created and linked to customer");

      const [eCheck] = await sql<{ client: string; customer_id: string | null }[]>`
        select client, customer_id from estimates where id = ${estimateId}::uuid
      `;
      if (!eCheck || eCheck.customer_id !== customerId) {
        throw new Error("Estimate.customer_id does not match created customer");
      }
      if (!eCheck.client || !eCheck.client.includes(customerName)) {
        throw new Error("Estimate.client does not contain customer name");
      }
      steps.push("estimate shows correct customer link");

      await sql`delete from estimates where id = ${estimateId}::uuid`;
      steps.push("estimate deleted");
      await sql`delete from customers where id = ${customerId}::uuid`;
      steps.push("customer deleted");

      results.push({
        name: "Flow4 CUSTOMER → ESTIMATE",
        ok: true,
        steps,
      });
    } catch (e) {
      if (estimateId) await sql`delete from estimates where id = ${estimateId}::uuid`;
      if (customerId) await sql`delete from customers where id = ${customerId}::uuid`;
      steps.push(`ERROR: ${toError(e)}`);
      results.push({
        name: "Flow4 CUSTOMER → ESTIMATE",
        ok: false,
        steps,
      });
    }
  }

  await sql.end();

  // Print summary
  const allOk = results.every((r) => r.ok);
  console.log("=== Integration Test Results ===");
  for (const r of results) {
    console.log(`\n[${r.ok ? "PASS" : "FAIL"}] ${r.name}`);
    for (const s of r.steps) {
      console.log(`  - ${s}`);
    }
  }
  console.log("\nOverall:", allOk ? "PASS" : "FAIL");

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("Unexpected error:", toError(e));
  process.exit(1);
});
