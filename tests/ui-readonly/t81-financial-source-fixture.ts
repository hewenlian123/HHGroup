import { loadARPageReadModel } from "../../src/lib/financial/invoice-read-model";
import { computeSummary, type EstimateItemRow } from "../../src/lib/estimates-db";
import type { Invoice, InvoicePayment } from "../../src/lib/invoices-db";
import {
  buildPayrollSummaryRows,
  type BuildPayrollSummaryRowsInput,
} from "../../src/app/labor/payroll/compute-payroll-summary-rows";
import { calculateProjectFinancialSnapshot } from "../../src/lib/financial/project-financial-snapshot";
import { computeDashboardStatsFromProjects } from "../../src/lib/data";

// Synthetic source records only. No client method is available and no database is contacted.
export const sourceId = "T81-source-reconciliation-v1";
export const invoiceSources: Invoice[] = [999999999.99, 961.26, 1.005].map((total, index) => ({
  id: `${sourceId}-${index}`,
  invoiceNo: `T81-${index}`,
  projectId: "T81-project",
  clientName: "T81 synthetic customer",
  issueDate: "2026-09-01",
  dueDate: "2026-09-30",
  status: "Sent",
  lineItems: [],
  subtotal: total,
  taxAmount: 0,
  total,
}));
export const paymentSources: InvoicePayment[] = [
  {
    id: "T81-deposit",
    invoiceId: invoiceSources[1].id,
    date: "2026-09-01",
    amount: 384.5,
    method: "Check",
    status: "Posted",
  },
  {
    id: "T81-voided",
    invoiceId: invoiceSources[1].id,
    date: "2026-09-01",
    amount: 999999999.99,
    method: "Check",
    status: "Voided",
  },
  {
    id: "T81-unrelated",
    invoiceId: "T81-other-invoice",
    date: "2026-09-01",
    amount: 12.34,
    method: "Check",
    status: "Posted",
  },
];
export async function invoiceReadModel() {
  return loadARPageReadModel(
    {} as Parameters<typeof loadARPageReadModel>[0],
    {
      getInvoices: async () => invoiceSources,
      getInvoicePayments: async () => paymentSources,
      getProjects: async () => [],
    },
    new Date("2026-09-07T12:00:00Z")
  );
}

export const estimateSources = [
  {
    id: "T81-estimate-long",
    unitCost: 999999999.99,
    tax: 0,
    discount: 0,
    expected: ["$999,999,999.99", "$0.00", "$0.00", "$999,999,999.99"],
  },
  {
    id: "T81-estimate-baseline",
    unitCost: 1020.01,
    tax: 48.06,
    discount: 106.81,
    expected: ["$1,020.01", "-$106.81", "$48.06", "$961.26"],
  },
  {
    id: "T81-estimate-rounding",
    unitCost: 1.005,
    tax: 0,
    discount: 0,
    expected: ["$1.01", "$0.00", "$0.00", "$1.01"],
  },
] as const;
export function estimateDomain(source: (typeof estimateSources)[number]) {
  const item: EstimateItemRow = {
    id: `${source.id}-line`,
    estimateId: source.id,
    costCode: "020000",
    desc: "Synthetic source line",
    qty: 1,
    unit: "LS",
    unitCost: source.unitCost,
    markupPct: 0,
    hideAmountOnPdf: false,
    status: "included",
    sortOrder: 0,
  };
  const value = computeSummary([item], source, () => "material");
  return {
    ...value,
    grandTotal: value.total,
    overheadPct: 0,
    profitPct: 0,
    overhead: 0,
    profit: 0,
  };
}

export const payrollSource: BuildPayrollSummaryRowsInput = {
  fromDate: "2026-09-01",
  toDate: "2026-09-30",
  projectFilter: "T81-project",
  includeLaborInvoices: false,
  workers: [{ id: "T81-worker", name: "T81 Synthetic Worker" }],
  laborEntries: [
    {
      id: "T81-work",
      workerId: "T81-worker",
      projectId: "T81-project",
      workDate: "2026-09-01",
      dayType: "full_day",
      dailyRate: 999999999.99,
      otAmount: 0,
      notes: null,
      createdAt: "2026-09-01",
    },
  ],
  reimbursementsAll: [],
  workerInvoicesAll: [],
  laborInvoicesAll: [],
  advancesAll: [],
  paymentsAll: [
    {
      id: "T81-pay",
      workerId: "T81-worker",
      projectId: "T81-project",
      amount: 1000000000,
      paymentDate: "2026-09-01",
      paymentMethod: "Check",
      laborEntryIds: null,
      notes: null,
      createdAt: "2026-09-01",
    },
  ],
};
export const payrollDomain = () => buildPayrollSummaryRows(payrollSource);
export const projectSource = {
  projectId: "11111111-1111-1111-1111-111111111111",
  contractValue: 1000000,
  expenseLines: [{ id: "T81-expense", amount: 999999999.99, status: "Approved" }],
  laborEntries: [{ id: "T81-labor", costAmount: 100.01 }],
  subcontractCosts: [{ id: "T81-subcontract", amount: 200.02, status: "Approved" }],
  commissionCosts: [{ id: "T81-commission", amount: 300.03 }],
};
export const projectDomain = () => calculateProjectFinancialSnapshot(projectSource);
export function dashboardDomain() {
  return computeDashboardStatsFromProjects(
    [
      {
        id: "T81-dashboard",
        name: "T81 Dashboard Project",
        status: "active",
        budget: 999999999.99,
        updated: "2026-09-01",
        sourceEstimateId: null,
        snapshotRevenue: null,
        snapshotBudgetCost: null,
        snapshotBudgetBreakdown: null,
      },
    ],
    new Map([
      [
        "T81-dashboard",
        {
          revenue: 999999999.99,
          actualCost: 0,
          profit: 999999999.99,
          margin: 1,
          budget: 999999999.99,
          approvedChangeOrders: 0,
          laborCost: 0,
          expenseCost: 0,
          subcontractCost: 0,
          commissionCost: 0,
        },
      ],
    ])
  );
}
