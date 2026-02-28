export type MockProjectStatus = "active" | "pending" | "completed";
export interface MockProject {
  id: string;
  name: string;
  status: MockProjectStatus;
  budget: number;
  spent: number;
  updated: string;
}
export const MOCK_PROJECTS: MockProject[] = [];

/** Optional per-project financial overrides (cash flow / cost breakdown). Used when present. */
export const MOCK_PROJECT_FINANCIAL_OVERRIDES: Record<
  string,
  { incomeTotal: number; expenseTotal: number; laborCost: number; materialCost?: number; vendorCost?: number; otherCost?: number }
> = {};

export interface MockRecentTransaction {
  id: string;
  date: string;
  project: string;
  type: "expense" | "income";
  amount: number;
  note: string;
}
export const MOCK_RECENT_TRANSACTIONS: MockRecentTransaction[] = [];

export interface MockProjectLaborRow {
  id: string;
  projectId: string;
  worker: string;
  hours: number;
  rate: number;
  totalPaid: number;
  advance: number;
  remaining: number;
  status: "paid" | "pending";
}
export const MOCK_PROJECT_LABOR: MockProjectLaborRow[] = [];

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

export const laborWorkers: Worker[] = [];

export const laborEntries: LaborEntry[] = [];
/** Backward-compatible alias for old naming. */
export const laborShiftEntries = laborEntries;
export const laborInvoices: LaborInvoice[] = [];
export const laborPayments: LaborPayment[] = [];

export interface MockProjectTransactionRow {
  id: string;
  projectId: string;
  date: string;
  type: "expense" | "income";
  name: string;
  amount: number;
  note: string;
}
export const MOCK_PROJECT_TRANSACTIONS: MockProjectTransactionRow[] = [];

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

export const expenses: Expense[] = [];

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

export const bankTransactions: BankTransaction[] = [];

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

export const invoices: Invoice[] = [];

export const invoicePayments: InvoicePayment[] = [];

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

export const commitments: Commitment[] = [];

export const projectEstimates: Array<{
  projectId: string;
  revenue: number;
  cost: number;
  materialsCost: number;
  laborCost: number;
  vendorCost: number;
  otherCost: number;
}> = [];

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
export const projectsFromEstimates: ProjectFromEstimate[] = [];

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

export const estimateItems: EstimateDraftItem[] = [];

export const estimateMeta: Record<string, { client: { name: string; phone: string; email: string; address: string }; project: { name: string; siteAddress: string } }> = {};
