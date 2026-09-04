import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeInvoiceDerived,
  getInvoicePayments,
  getInvoices,
  type Invoice,
  type InvoicePayment,
  type InvoiceWithDerived,
} from "@/lib/invoices-db";
import { getProjects, type Project } from "@/lib/projects-db";

type InvoiceReadModelDependencies = {
  getInvoices: (client: SupabaseClient) => Promise<Invoice[]>;
  getInvoicePayments: (client: SupabaseClient) => Promise<InvoicePayment[]>;
  getProjects: (client: SupabaseClient) => Promise<Project[]>;
};

const defaultDependencies: InvoiceReadModelDependencies = {
  getInvoices,
  getInvoicePayments,
  getProjects,
};

function deriveInvoices(
  invoices: Invoice[],
  payments: InvoicePayment[],
  now: Date
): InvoiceWithDerived[] {
  const paymentsByInvoice = new Map<string, InvoicePayment[]>();
  for (const payment of payments) {
    const rows = paymentsByInvoice.get(payment.invoiceId) ?? [];
    rows.push(payment);
    paymentsByInvoice.set(payment.invoiceId, rows);
  }

  return invoices
    .map((invoice) => ({
      ...invoice,
      ...computeInvoiceDerived(invoice, paymentsByInvoice.get(invoice.id) ?? [], now),
    }))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

async function loadInvoiceLedger(
  client: SupabaseClient,
  deps: InvoiceReadModelDependencies,
  now: Date
) {
  const [invoices, payments] = await Promise.all([
    deps.getInvoices(client),
    deps.getInvoicePayments(client),
  ]);
  return { invoices: deriveInvoices(invoices, payments, now), payments };
}

export async function loadProjectInvoiceReadModel(
  projectId: string,
  client: SupabaseClient,
  deps: InvoiceReadModelDependencies = defaultDependencies,
  now = new Date()
) {
  const ledger = await loadInvoiceLedger(client, deps, now);
  const projectInvoices = ledger.invoices.filter(
    (invoice) => invoice.projectId === projectId && invoice.computedStatus !== "Void"
  );
  const billableInvoices = projectInvoices.filter(
    (invoice) => invoice.computedStatus !== "Draft"
  );
  const billableIds = new Set(billableInvoices.map((invoice) => invoice.id));

  let invoicedTotal = 0;
  let paidTotal = 0;
  let arBalance = 0;
  for (const invoice of billableInvoices) {
    invoicedTotal += invoice.total;
    paidTotal += invoice.paidTotal;
    arBalance += invoice.balanceDue;
  }

  let lastPaymentDate: string | null = null;
  for (const payment of ledger.payments) {
    if (!billableIds.has(payment.invoiceId)) continue;
    if (!lastPaymentDate || payment.date > lastPaymentDate) lastPaymentDate = payment.date;
  }

  return {
    billingSummary: { invoicedTotal, paidTotal, arBalance, lastPaymentDate },
    projectInvoices,
  };
}

export async function loadARPageReadModel(
  client: SupabaseClient,
  deps: InvoiceReadModelDependencies = defaultDependencies,
  now = new Date()
) {
  const [ledger, projects] = await Promise.all([
    loadInvoiceLedger(client, deps, now),
    deps.getProjects(client),
  ]);
  const today = now.toISOString().slice(0, 10);
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const outstanding = ledger.invoices.filter(
    (invoice) =>
      invoice.computedStatus === "Unpaid" ||
      invoice.computedStatus === "Partial" ||
      invoice.computedStatus === "Overdue"
  );
  const totalAR = outstanding.reduce((sum, invoice) => sum + invoice.balanceDue, 0);
  const overdueAR = outstanding.reduce(
    (sum, invoice) => sum + (invoice.dueDate < today ? invoice.balanceDue : 0),
    0
  );
  const paidThisMonth = ledger.payments.reduce(
    (sum, payment) =>
      payment.status !== "Voided" && payment.date >= startOfMonth && payment.date <= today
        ? sum + payment.amount
        : sum,
    0
  );

  return {
    summary: { totalAR, overdueAR, paidThisMonth },
    outstanding,
    projects,
  };
}
