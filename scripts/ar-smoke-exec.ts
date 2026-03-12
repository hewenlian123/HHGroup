/**
 * Production AR execution test – create real invoice via application layer.
 * Run from project root: npx tsx scripts/ar-smoke-exec.ts
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Load .env.local before any app code that reads process.env
function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    console.warn(".env.local not found; using existing process.env");
    return;
  }
  const content = readFileSync(path, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

loadEnvLocal();

async function main() {
  const projectId = "562f15b5-08ac-40eb-8efd-ab756a1730e5";
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Dynamic import so env is set first
  const { createInvoice, recordInvoicePayment } = await import("../src/lib/data");

  console.log("Step 1 – Create invoice via createInvoice()...");
  const inv = await createInvoice({
    projectId,
    clientName: "AR Smoke Test",
    issueDate: today,
    dueDate,
    lineItems: [
      {
        description: "AR smoke test line",
        qty: 1,
        unitPrice: 1000,
        amount: 1000,
      },
    ],
  });

  console.log("Created invoice:", inv.id);
  console.log("  invoice_no:", inv.invoiceNo);
  console.log("  project_id:", inv.projectId);
  console.log("  total:", inv.total);
  console.log("  subtotal:", inv.subtotal);

  if (inv.total !== 1000) {
    throw new Error(`Expected total 1000, got ${inv.total}`);
  }

  console.log("\nStep 2 – Verify in DB (run in Supabase SQL Editor):");
  console.log(`
select invoice_no, project_id, total, paid_total, balance_due
from public.invoices
order by created_at desc
limit 5;
`);

  console.log("Step 3 – Add payment via recordInvoicePayment()...");
  const payment = await recordInvoicePayment(inv.id, {
    date: today,
    amount: 600,
    method: "Cash",
    memo: "Partial payment",
  });

  if (!payment) {
    throw new Error("recordInvoicePayment returned null");
  }
  console.log("Payment recorded:", payment.id, "amount:", payment.amount);

  console.log("\nStep 4 – Verify payment (run in Supabase SQL Editor):");
  console.log(`
select
  i.invoice_no,
  i.total,
  coalesce(sum(p.amount),0) as paid,
  i.total - coalesce(sum(p.amount),0) as balance
from public.invoices i
left join public.invoice_payments p on p.invoice_id = i.id
group by i.invoice_no, i.total;
`);

  console.log("\nDone. Invoice ID:", inv.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
