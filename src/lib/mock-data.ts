export const MOCK_PROJECTS = [
  { id: "p1", name: "Luxury Villa A", status: "active" as const, budget: 2500000, spent: 1200000, updated: "2025-02-22" },
  { id: "p2", name: "Residential Tower B", status: "active" as const, budget: 5000000, spent: 2100000, updated: "2025-02-21" },
  { id: "p3", name: "Office Complex C", status: "pending" as const, budget: 8000000, spent: 0, updated: "2025-02-18" },
  { id: "p4", name: "Renovation D", status: "completed" as const, budget: 800000, spent: 780000, updated: "2025-02-15" },
];

/** Optional per-project financial overrides (cash flow / cost breakdown). Used when present. */
export const MOCK_PROJECT_FINANCIAL_OVERRIDES: Record<
  string,
  { incomeTotal: number; expenseTotal: number; laborCost: number; materialCost?: number; vendorCost?: number; otherCost?: number }
> = {
  p1: { incomeTotal: 10000, expenseTotal: 25000, laborCost: 8000 },
};

export const MOCK_RECENT_TRANSACTIONS = [
  { id: "t1", date: "2025-02-22", project: "Luxury Villa A", type: "expense" as const, amount: -45000, note: "Materials" },
  { id: "t2", date: "2025-02-21", project: "Luxury Villa A", type: "income" as const, amount: 500000, note: "Progress payment" },
  { id: "t3", date: "2025-02-20", project: "Residential Tower B", type: "expense" as const, amount: -38000, note: "Steel" },
  { id: "t4", date: "2025-02-18", project: "Luxury Villa A", type: "expense" as const, amount: -8200, note: "Payroll" },
  { id: "t5", date: "2025-02-15", project: "Renovation D", type: "expense" as const, amount: -12000, note: "Equipment" },
];

export const MOCK_PROJECT_LABOR = [
  { id: "pl1", projectId: "p1", worker: "Zhang Wei", hours: 120, rate: 85, totalPaid: 10200, advance: 2000, remaining: 8200, status: "paid" as const },
  { id: "pl2", projectId: "p1", worker: "Li Ming", hours: 80, rate: 72, totalPaid: 5760, advance: 0, remaining: 5760, status: "pending" as const },
  { id: "pl3", projectId: "p2", worker: "Wang Fang", hours: 160, rate: 68, totalPaid: 10880, advance: 3000, remaining: 7880, status: "paid" as const },
  { id: "pl4", projectId: "p2", worker: "Chen Hao", hours: 40, rate: 55, totalPaid: 2200, advance: 0, remaining: 2200, status: "pending" as const },
];

export interface Worker {
  id: string;
  name: string;
  phone?: string;
  trade?: string;
  status: "active" | "inactive";
  halfDayRate: number;
  notes?: string;
  createdAt: string;
}

/** Backward-compatible alias for existing labor screen. */
export type LaborWorker = Worker;

export interface LaborEntry {
  id: string;
  date: string;
  workerId: string;
  amWorked: boolean;
  amProjectId?: string;
  pmWorked: boolean;
  pmProjectId?: string;
  otAmount: number;
  otProjectId?: string;
  total: number;
  status: "draft" | "confirmed";
  reviewedAt?: string;
  checklist: {
    verifiedWorker: boolean;
    verifiedProjects: boolean;
    verifiedAmount: boolean;
  };
}

/** Backward-compatible alias for old naming. */
export type LaborShiftEntry = LaborEntry;

export interface LaborInvoiceSplit {
  projectId: string;
  amount: number;
}

export interface LaborInvoiceChecklist {
  verifiedWorker: boolean;
  verifiedAmount: boolean;
  verifiedAllocation: boolean;
  verifiedAttachment: boolean;
}

export interface LaborInvoice {
  id: string;
  invoiceNo: string;
  workerId: string;
  invoiceDate: string;
  amount: number;
  memo?: string;
  projectSplits: LaborInvoiceSplit[];
  status: "draft" | "reviewed" | "confirmed" | "void";
  checklist: LaborInvoiceChecklist;
  attachments: Attachment[];
  createdAt: string;
  confirmedAt?: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface LaborPayment {
  id: string;
  workerId: string;
  paymentDate: string;
  amount: number;
  method: string;
  memo?: string;
  attachments: Attachment[];
  appliedRange: {
    startDate: string;
    endDate: string;
  };
  createdAt: string;
}

export const laborWorkers: Worker[] = [
  { id: "lw1", name: "Zhang Wei", phone: "555-0101", trade: "Foreman", status: "active", halfDayRate: 400, notes: "Core team", createdAt: "2025-01-05" },
  { id: "lw2", name: "Li Ming", phone: "555-0102", trade: "Carpenter", status: "active", halfDayRate: 350, createdAt: "2025-01-10" },
  { id: "lw3", name: "Wang Fang", phone: "555-0103", trade: "Steel", status: "active", halfDayRate: 380, createdAt: "2025-01-15" },
];

export const laborEntries: LaborEntry[] = [];
/** Backward-compatible alias for old naming. */
export const laborShiftEntries = laborEntries;
export const laborInvoices: LaborInvoice[] = [];
export const laborPayments: LaborPayment[] = [];

export const MOCK_PROJECT_TRANSACTIONS = [
  { id: "pt1", projectId: "p1", date: "2025-02-22", type: "expense" as const, name: "Materials Co.", amount: -45000, note: "Steel & concrete" },
  { id: "pt2", projectId: "p1", date: "2025-02-21", type: "income" as const, name: "Villa A Client", amount: 500000, note: "Progress payment" },
  { id: "pt3", projectId: "p1", date: "2025-02-18", type: "expense" as const, name: "Zhang Wei", amount: -8200, note: "Payroll" },
  { id: "pt4", projectId: "p1", date: "2025-02-15", type: "expense" as const, name: "Equipment Rent", amount: -12000, note: "February" },
  { id: "pt5", projectId: "p2", date: "2025-02-20", type: "expense" as const, name: "Steel Supply", amount: -38000, note: "" },
];

export const expenseCategories = [
  "Materials",
  "Labor",
  "Equipment",
  "Permit",
  "Fuel",
  "Office",
  "Subcontractor",
  "Other",
];

export const paymentMethods = [
  "ACH",
  "Card",
  "Cash",
  "Check",
  "Wire",
  "Zelle",
];

export const vendors = [
  "Home Depot",
  "Materials Co.",
  "Steel Supply Inc.",
  "City Permit Office",
  "Equipment Rentals",
];

/** Disabled (soft-deleted) items: excluded from dropdowns but existing records keep showing the value. */
export const disabledExpenseCategories: string[] = [];
export const disabledVendors: string[] = [];
export const disabledPaymentMethods: string[] = [];

export type ExpensePaymentMethod = "Cash" | "Check" | "Card" | "ACH" | "Wire" | "Other";

export interface ExpenseAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface ExpenseLine {
  id: string;
  projectId: string | null;
  category: string;
  costCode?: string | null;
  memo?: string | null;
  amount: number;
}

export interface Expense {
  id: string;
  date: string;
  vendorName: string;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  attachments: ExpenseAttachment[];
  lines: ExpenseLine[];
  /** When set, this expense is linked to exactly one bank transaction (1:1). */
  linkedBankTxId?: string | null;
}

/** Normalize old single-line expense shape to new lines structure (for backward compat on read). */
export function normalizeExpense(exp: Expense | (Expense & { projectId?: string | null; amount?: number; category?: string; description?: string })): Expense {
  const hasOldShape = "projectId" in exp && "amount" in exp && (!exp.lines || exp.lines.length === 0);
  if (hasOldShape) {
    const old = exp as Expense & { projectId?: string | null; amount?: number; category?: string; description?: string };
    return {
      id: old.id,
      date: old.date,
      vendorName: old.vendorName,
      paymentMethod: old.paymentMethod,
      referenceNo: old.referenceNo,
      notes: old.notes,
      attachments: old.attachments ?? [],
      lines: [
        {
          id: `line-${old.id}-0`,
          projectId: old.projectId ?? null,
          category: old.category ?? "Other",
          memo: old.description ?? null,
          amount: old.amount ?? 0,
        },
      ],
    };
  }
  return {
    ...exp,
    attachments: exp.attachments ?? [],
    lines: exp.lines?.length ? exp.lines : [{ id: `line-${exp.id}-0`, projectId: null, category: "Other", amount: 0 }],
  };
}

/** @deprecated Use Expense */
export type ExpenseRecord = Expense;

export const expenses: Expense[] = [
  {
    id: "ex1",
    date: "2025-02-22",
    vendorName: "Materials Co.",
    paymentMethod: "ACH",
    referenceNo: "INV-2201",
    notes: "Net 30",
    attachments: [],
    lines: [{ id: "ex1-l1", projectId: "p1", category: "Materials", memo: "Steel & concrete delivery", amount: 45000 }],
  },
  {
    id: "ex2",
    date: "2025-02-21",
    vendorName: "Zhang Wei",
    paymentMethod: "Check",
    referenceNo: "CHK-4401",
    attachments: [],
    lines: [{ id: "ex2-l1", projectId: "p1", category: "Labor", memo: "Payroll", amount: 8200 }],
  },
  {
    id: "ex3",
    date: "2025-02-20",
    vendorName: "Steel Supply Inc.",
    paymentMethod: "Card",
    attachments: [],
    lines: [{ id: "ex3-l1", projectId: "p2", category: "Materials", memo: "Structural steel", amount: 38000 }],
  },
  {
    id: "ex4",
    date: "2025-02-18",
    vendorName: "City Permit Office",
    paymentMethod: "Cash",
    attachments: [],
    lines: [{ id: "ex4-l1", projectId: null, category: "Permit", memo: "Building permit renewal", amount: 1200 }],
  },
  {
    id: "ex5",
    date: "2025-02-15",
    vendorName: "Equipment Rentals",
    paymentMethod: "ACH",
    notes: "Monthly",
    attachments: [],
    lines: [{ id: "ex5-l1", projectId: "p1", category: "Equipment", memo: "Excavator Feb", amount: 12000 }],
    linkedBankTxId: "bt7",
  },
  {
    id: "ex6",
    date: "2025-02-14",
    vendorName: "Home Depot",
    paymentMethod: "Card",
    attachments: [],
    lines: [
      { id: "ex6-l1", projectId: "p1", category: "Materials", memo: "Lumber", amount: 700 },
      { id: "ex6-l2", projectId: "p2", category: "Materials", memo: "Hardware", amount: 300 },
      { id: "ex6-l3", projectId: null, category: "Other", memo: "Overhead supplies", amount: 200 },
    ],
  },
  {
    id: "ex7",
    date: "2025-02-12",
    vendorName: "Office Depot",
    paymentMethod: "ACH",
    referenceNo: "OD-8899",
    attachments: [
      { id: "ex7-a1", fileName: "receipt1.pdf", mimeType: "application/pdf", size: 120000, url: "blob:mock", createdAt: "2025-02-12" },
      { id: "ex7-a2", fileName: "photo.jpg", mimeType: "image/jpeg", size: 240000, url: "blob:mock2", createdAt: "2025-02-12" },
    ],
    lines: [{ id: "ex7-l1", projectId: null, category: "Office", memo: "Printer paper", amount: 450 }],
    linkedBankTxId: "bt10",
  },
];

export type BankTransactionStatus = "unmatched" | "reconciled";

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: BankTransactionStatus;
  linkedExpenseId?: string | null;
  createdAt: string;
  reconciledAt?: string;
  reconciledBy?: string;
}

export const bankTransactions: BankTransaction[] = [
  { id: "bt1", date: "2025-02-22", description: "Home Depot", amount: -1200, status: "unmatched", createdAt: "2025-02-22" },
  { id: "bt2", date: "2025-02-22", description: "Materials Co. INV-2201", amount: -45000, status: "unmatched", createdAt: "2025-02-22" },
  { id: "bt3", date: "2025-02-21", description: "City Permit Office", amount: -1200, status: "unmatched", createdAt: "2025-02-21" },
  { id: "bt4", date: "2025-02-21", description: "Payroll Zhang Wei", amount: -8200, status: "unmatched", createdAt: "2025-02-21" },
  { id: "bt5", date: "2025-02-21", description: "Client deposit Villa A", amount: 500000, status: "reconciled", createdAt: "2025-02-21", reconciledAt: "2025-02-21", reconciledBy: "owner" },
  { id: "bt6", date: "2025-02-20", description: "Steel Supply Inc.", amount: -38000, status: "unmatched", createdAt: "2025-02-20" },
  { id: "bt7", date: "2025-02-18", description: "Equipment Rentals", amount: -12000, status: "reconciled", linkedExpenseId: "ex5", createdAt: "2025-02-18", reconciledAt: "2025-02-18", reconciledBy: "owner" },
  { id: "bt8", date: "2025-02-15", description: "Office supplies", amount: -450, status: "unmatched", createdAt: "2025-02-15" },
  { id: "bt9", date: "2025-02-14", description: "Wire transfer to savings", amount: -10000, status: "unmatched", createdAt: "2025-02-14" },
  { id: "bt10", date: "2025-02-12", description: "Office Depot OD-8899", amount: -450, status: "reconciled", linkedExpenseId: "ex7", createdAt: "2025-02-12", reconciledAt: "2025-02-12", reconciledBy: "owner" },
  { id: "bt11", date: "2025-02-10", description: "Contractor payment", amount: -25000, status: "unmatched", createdAt: "2025-02-10" },
  { id: "bt12", date: "2025-02-08", description: "Progress payment received", amount: 200000, status: "unmatched", createdAt: "2025-02-08" },
];

export type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";

export interface InvoiceLineItem {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxPct?: number;
  taxAmount?: number;
  total: number;
  notes?: string;
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  memo?: string;
  status?: "Posted" | "Voided";
}

export const invoices: Invoice[] = [
  {
    id: "inv1",
    invoiceNo: "INV-0001",
    projectId: "p1",
    clientName: "Villa A Client",
    issueDate: "2025-02-01",
    dueDate: "2025-03-01",
    status: "Sent",
    lineItems: [{ description: "Progress payment – Phase 1", qty: 1, unitPrice: 50000, amount: 50000 }],
    subtotal: 50000,
    total: 50000,
  },
  {
    id: "inv2",
    invoiceNo: "INV-0002",
    projectId: "p2",
    clientName: "Tower B Client",
    issueDate: "2025-01-10",
    dueDate: "2025-02-10",
    status: "Sent",
    lineItems: [{ description: "Progress payment – Structure", qty: 1, unitPrice: 30000, amount: 30000 }],
    subtotal: 30000,
    total: 30000,
  },
];

export const invoicePayments: InvoicePayment[] = [
  { id: "pay-1", invoiceId: "inv1", date: "2025-02-05", amount: 10000, method: "ACH", status: "Posted" },
  { id: "pay-2", invoiceId: "inv1", date: "2025-02-12", amount: 15000, method: "Wire", status: "Posted" },
  { id: "pay-3", invoiceId: "inv2", date: "2025-02-14", amount: 5000, method: "Check", status: "Posted" },
  { id: "pay-4", invoiceId: "inv2", date: "2025-02-15", amount: 3000, method: "ACH", status: "Voided" },
];

export type CommitmentType = "PO" | "Subcontract" | "Other";
export type CommitmentStatus = "Open" | "Closed";

export interface Commitment {
  id: string;
  projectId: string;
  date: string;
  vendorName: string;
  type: CommitmentType;
  amount: number;
  status: CommitmentStatus;
  notes?: string;
  attachments: ExpenseAttachment[];
}

export const commitments: Commitment[] = [
  {
    id: "cm1",
    projectId: "p1",
    date: "2025-02-20",
    vendorName: "Materials Co.",
    type: "PO",
    amount: 25000,
    status: "Open",
    notes: "Steel package PO",
    attachments: [
      {
        id: "cm1-a1",
        fileName: "po-steel.png",
        mimeType: "image/png",
        size: 68,
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8Wf9kAAAAASUVORK5CYII=",
        createdAt: "2025-02-20",
      },
    ],
  },
  {
    id: "cm2",
    projectId: "p1",
    date: "2025-02-21",
    vendorName: "ABC Subcontracting",
    type: "Subcontract",
    amount: 40000,
    status: "Open",
    notes: "Facade subcontract deposit commitment",
    attachments: [],
  },
  {
    id: "cm3",
    projectId: "p1",
    date: "2025-02-10",
    vendorName: "Equipment Rentals",
    type: "Other",
    amount: 12000,
    status: "Closed",
    notes: "Converted to paid expense",
    attachments: [],
  },
];

export const projectEstimates = [
  {
    projectId: "p1",
    revenue: 2550000,
    cost: 1110000,
    materialsCost: 444000,
    laborCost: 388500,
    vendorCost: 166500,
    otherCost: 111000,
  },
  {
    projectId: "p2",
    revenue: 5100000,
    cost: 1910000,
    materialsCost: 764000,
    laborCost: 668500,
    vendorCost: 286500,
    otherCost: 191000,
  },
];

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Converted";

export interface EstimateDraftItem {
  id: string;
  estimateId: string;
  costCode: string;
  desc: string;
  qty: number;
  unit: string;
  unitCost: number;
  markupPct: number;
}

export interface EstimateFrozenPayload {
  number: string;
  clientName: string;
  projectName: string;
  address: string;
  client: { name: string; phone: string; email: string; address: string };
  project: { name: string; siteAddress: string };
  items: EstimateDraftItem[];
  overheadPct: number;
  profitPct: number;
  updatedAt: string;
}

export interface EstimateSnapshot {
  snapshotId: string;
  estimateId: string;
  version: number;
  createdAt: string;
  statusAtSnapshot: "Approved" | "Converted";
  frozenPayload: EstimateFrozenPayload;
}

export interface SnapshotBudgetBreakdown {
  materials: number;
  labor: number;
  vendor: number;
  other: number;
}

export interface ProjectFromEstimate {
  projectId: string;
  sourceEstimateId: string;
  sourceSnapshotId: string;
  sourceVersion: number;
  snapshotRevenue?: number;
  snapshotBudgetCost?: number;
  snapshotBudgetBreakdown?: SnapshotBudgetBreakdown;
}

export const estimateSnapshots: EstimateSnapshot[] = [];
export const projectsFromEstimates: ProjectFromEstimate[] = [
  {
    projectId: "p1",
    sourceEstimateId: "est1",
    sourceSnapshotId: "snap-p1",
    sourceVersion: 1,
    snapshotRevenue: 2_550_000,
    snapshotBudgetCost: 2_000_000,
    snapshotBudgetBreakdown: { materials: 800_000, labor: 700_000, vendor: 300_000, other: 200_000 },
  },
];

function nextSnapshotId(): string {
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const costCodeMaster = [
  { code: "030000", name: "Concrete" },
  { code: "040000", name: "Masonry" },
  { code: "050000", name: "Metals" },
  { code: "060000", name: "Wood & Plastics" },
  { code: "080000", name: "Openings" },
];

export const estimateList: Array<{ id: string; number: string; client: string; project: string; status: EstimateStatus; updatedAt: string; total: number; approvedAt?: string }> = [
  { id: "est1", number: "EST-0001", client: "Zhang Development", project: "Luxury Villa A", status: "Draft" as const, updatedAt: "2025-02-24", total: 23667 },
  { id: "est2", number: "EST-0002", client: "Li Construction", project: "Residential Tower B", status: "Sent" as const, updatedAt: "2025-02-22", total: 127609 },
];

export function createEstimate(payload: { clientName: string; projectName: string; address: string }): string {
  const nextNum = estimateList.length + 1;
  const id = `est${nextNum}`;
  const number = `EST-${String(nextNum).padStart(4, "0")}`;
  const now = new Date().toISOString().slice(0, 10);
  estimateList.push({
    id,
    number,
    client: payload.clientName,
    project: payload.projectName,
    status: "Draft",
    updatedAt: now,
    total: 0,
  });
  estimateMeta[id] = {
    client: { name: payload.clientName, phone: "", email: "", address: payload.address },
    project: { name: payload.projectName, siteAddress: payload.address },
  };
  return id;
}

/** Status change only. Not guarded by ensureDraft — allowed for Draft→Sent→Approved→Converted. */
export function setEstimateStatus(estimateId: string, nextStatus: "Sent" | "Approved" | "Converted"): boolean {
  const row = estimateList.find((e) => e.id === estimateId);
  if (!row) return false;
  const now = new Date().toISOString().slice(0, 10);
  row.status = nextStatus;
  row.updatedAt = now;
  if (nextStatus === "Approved") {
    (row as { approvedAt?: string }).approvedAt = now;
  }
  if (nextStatus === "Converted") {
    delete (row as { approvedAt?: string }).approvedAt;
  }
  return true;
}

export function createEstimateSnapshot(estimateId: string): EstimateSnapshot | null {
  const row = estimateList.find((e) => e.id === estimateId);
  if (!row || row.status === "Approved" || row.status === "Converted") return null;
  const meta = estimateMeta[estimateId];
  if (!meta) return null;
  const items = estimateItems.filter((e) => e.estimateId === estimateId);
  const lastVersion = estimateSnapshots.filter((s) => s.estimateId === estimateId).reduce((max, s) => Math.max(max, s.version), 0);
  const version = lastVersion + 1;
  const now = new Date().toISOString().slice(0, 10);
  const frozenPayload: EstimateFrozenPayload = {
    number: row.number,
    clientName: row.client,
    projectName: row.project,
    address: meta.client.address,
    client: { ...meta.client },
    project: { ...meta.project },
    items: items.map((i) => ({ ...i })),
    overheadPct: 0.05,
    profitPct: 0.1,
    updatedAt: now,
  };
  const snapshot: EstimateSnapshot = {
    snapshotId: nextSnapshotId(),
    estimateId,
    version,
    createdAt: now,
    statusAtSnapshot: "Approved",
    frozenPayload,
  };
  estimateSnapshots.push(snapshot);
  setEstimateStatus(estimateId, "Approved");
  return snapshot;
}

export function createNewVersionFromSnapshot(estimateId: string): boolean {
  const row = estimateList.find((e) => e.id === estimateId);
  const snapshots = estimateSnapshots.filter((s) => s.estimateId === estimateId).sort((a, b) => b.version - a.version);
  const latest = snapshots.find((s) => s.statusAtSnapshot === "Approved");
  if (!row || !latest) return false;
  const payload = latest.frozenPayload;
  const toKeep = estimateItems.filter((e) => e.estimateId !== estimateId);
  const newItems = payload.items.map((item, idx) => ({
    ...item,
    id: `ei-${estimateId}-v${latest.version}-${idx}-${Date.now()}`,
    estimateId,
  }));
  estimateItems.length = 0;
  estimateItems.push(...toKeep, ...newItems);
  estimateMeta[estimateId] = { client: { ...payload.client }, project: { ...payload.project } };
  row.status = "Draft";
  row.updatedAt = new Date().toISOString().slice(0, 10);
  delete (row as { approvedAt?: string }).approvedAt;
  return true;
}

export function convertEstimateSnapshotToProject(estimateId: string): ProjectFromEstimate | null {
  const row = estimateList.find((e) => e.id === estimateId);
  if (!row || row.status !== "Approved") return null;
  const snapshots = estimateSnapshots.filter((s) => s.estimateId === estimateId && s.statusAtSnapshot === "Approved").sort((a, b) => b.version - a.version);
  const latest = snapshots[0];
  if (!latest) return null;
  const projectId = `p-from-${estimateId}`;
  const subtotal = latest.frozenPayload.items.reduce(
    (s, i) => s + i.qty * i.unitCost * (1 + i.markupPct),
    0
  );
  const grandTotal = subtotal * (1 + latest.frozenPayload.overheadPct + latest.frozenPayload.profitPct);
  const snapshotRevenue = Math.round(grandTotal);
  const snapshotBudgetCost = Math.round(subtotal);
  const snapshotBudgetBreakdown: SnapshotBudgetBreakdown = {
    materials: Math.round(subtotal * 0.4),
    labor: Math.round(subtotal * 0.35),
    vendor: Math.round(subtotal * 0.15),
    other: Math.round(subtotal * 0.1),
  };
  const record: ProjectFromEstimate = {
    projectId,
    sourceEstimateId: estimateId,
    sourceSnapshotId: latest.snapshotId,
    sourceVersion: latest.version,
    snapshotRevenue,
    snapshotBudgetCost,
    snapshotBudgetBreakdown,
  };
  projectsFromEstimates.push(record);
  MOCK_PROJECTS.push({
    id: projectId,
    name: latest.frozenPayload.projectName,
    status: "active",
    budget: snapshotRevenue,
    spent: 0,
    updated: new Date().toISOString().slice(0, 10),
  });
  setEstimateStatus(estimateId, "Converted");
  return record;
}

export function getEstimateSnapshotsByEstimateId(estimateId: string): EstimateSnapshot[] {
  return estimateSnapshots.filter((s) => s.estimateId === estimateId).sort((a, b) => a.version - b.version);
}

export function getEstimateSnapshotByVersion(estimateId: string, version: number): EstimateSnapshot | undefined {
  return estimateSnapshots.find((s) => s.estimateId === estimateId && s.version === version);
}

function ensureDraft(estimateId: string): boolean {
  const row = estimateList.find((e) => e.id === estimateId);
  if (!row || row.status !== "Draft") {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[mock-data] Estimate is locked (status !== Draft). No changes applied.", { estimateId, status: row?.status });
    }
    return false;
  }
  return true;
}

export function updateEstimateMeta(
  estimateId: string,
  payload: { client?: { name?: string; phone?: string; email?: string; address?: string }; project?: { name?: string; siteAddress?: string } }
): boolean {
  if (!ensureDraft(estimateId)) return false;
  const meta = estimateMeta[estimateId];
  if (!meta) return false;
  if (payload.client) {
    if (payload.client.name != null) meta.client.name = payload.client.name;
    if (payload.client.phone != null) meta.client.phone = payload.client.phone;
    if (payload.client.email != null) meta.client.email = payload.client.email;
    if (payload.client.address != null) meta.client.address = payload.client.address;
  }
  if (payload.project) {
    if (payload.project.name != null) meta.project.name = payload.project.name;
    if (payload.project.siteAddress != null) meta.project.siteAddress = payload.project.siteAddress;
  }
  const row = estimateList.find((e) => e.id === estimateId);
  if (row && payload.client?.name) row.client = payload.client.name;
  if (row && payload.project?.name) row.project = payload.project.name;
  row!.updatedAt = new Date().toISOString().slice(0, 10);
  return true;
}

export function addLineItem(
  estimateId: string,
  item: { costCode: string; desc: string; qty: number; unit: string; unitCost: number; markupPct: number }
): EstimateDraftItem | null {
  if (!ensureDraft(estimateId)) return null;
  const id = `ei-${estimateId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newItem: EstimateDraftItem = {
    id,
    estimateId,
    costCode: item.costCode,
    desc: item.desc,
    qty: item.qty,
    unit: item.unit,
    unitCost: item.unitCost,
    markupPct: item.markupPct,
  };
  estimateItems.push(newItem);
  const row = estimateList.find((e) => e.id === estimateId);
  if (row) row.updatedAt = new Date().toISOString().slice(0, 10);
  return newItem;
}

export function updateLineItem(
  estimateId: string,
  itemId: string,
  payload: { desc?: string; qty?: number; unit?: string; unitCost?: number; markupPct?: number }
): boolean {
  if (!ensureDraft(estimateId)) return false;
  const item = estimateItems.find((e) => e.estimateId === estimateId && e.id === itemId);
  if (!item) return false;
  if (payload.desc != null) item.desc = payload.desc;
  if (payload.qty != null) item.qty = payload.qty;
  if (payload.unit != null) item.unit = payload.unit;
  if (payload.unitCost != null) item.unitCost = payload.unitCost;
  if (payload.markupPct != null) item.markupPct = payload.markupPct;
  const row = estimateList.find((e) => e.id === estimateId);
  if (row) row.updatedAt = new Date().toISOString().slice(0, 10);
  return true;
}

export function deleteLineItem(estimateId: string, itemId: string): boolean {
  if (!ensureDraft(estimateId)) return false;
  const idx = estimateItems.findIndex((e) => e.estimateId === estimateId && e.id === itemId);
  if (idx === -1) return false;
  estimateItems.splice(idx, 1);
  const row = estimateList.find((e) => e.id === estimateId);
  if (row) row.updatedAt = new Date().toISOString().slice(0, 10);
  return true;
}

export const estimateItems = [
  { id: "ei1", estimateId: "est1", costCode: "030000", desc: "Slab concrete", qty: 10, unit: "CY", unitCost: 180, markupPct: 0.15 },
  { id: "ei2", estimateId: "est1", costCode: "030000", desc: "Footing concrete", qty: 8, unit: "CY", unitCost: 165, markupPct: 0.15 },
  { id: "ei3", estimateId: "est1", costCode: "040000", desc: "Brick veneer", qty: 1200, unit: "SF", unitCost: 12, markupPct: 0.18 },
  { id: "ei4", estimateId: "est2", costCode: "030000", desc: "Foundation concrete", qty: 45, unit: "CY", unitCost: 185, markupPct: 0.12 },
  { id: "ei5", estimateId: "est2", costCode: "050000", desc: "Structural steel", qty: 22, unit: "TON", unitCost: 4200, markupPct: 0.10 },
];

export const estimateMeta: Record<string, { client: { name: string; phone: string; email: string; address: string }; project: { name: string; siteAddress: string } }> = {
  est1: {
    client: { name: "Zhang Development", phone: "+1 555-0101", email: "contact@zhangdev.com", address: "100 Business Park, Shanghai" },
    project: { name: "Luxury Villa A", siteAddress: "88 Riverside Drive, Shanghai" },
  },
  est2: {
    client: { name: "Li Construction", phone: "+1 555-0102", email: "info@liconstruction.com", address: "200 Tower Ave, Beijing" },
    project: { name: "Residential Tower B", siteAddress: "50 Central Plaza, Beijing" },
  },
};
