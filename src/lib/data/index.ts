import { MOCK_PROJECTS, MOCK_RECENT_TRANSACTIONS, MOCK_PROJECT_LABOR, MOCK_PROJECT_TRANSACTIONS, MOCK_PROJECT_FINANCIAL_OVERRIDES, expenseCategories, disabledExpenseCategories, vendors, disabledVendors, paymentMethods, disabledPaymentMethods, expenses, bankTransactions, normalizeExpense, projectEstimates, costCodeMaster, estimateList, estimateItems, estimateMeta, createEstimate as createEstimateMock, createEstimateSnapshot as createEstimateSnapshotMock, createNewVersionFromSnapshot as createNewVersionFromSnapshotMock, convertEstimateSnapshotToProject as convertEstimateSnapshotToProjectMock, getEstimateSnapshotsByEstimateId, getEstimateSnapshotByVersion, projectsFromEstimates, setEstimateStatus as setEstimateStatusMock, updateEstimateMeta as updateEstimateMetaMock, addLineItem as addLineItemMock, updateLineItem as updateLineItemMock, deleteLineItem as deleteLineItemMock, invoices, invoicePayments, commitments, laborWorkers, laborEntries, laborInvoices, laborPayments, type EstimateSnapshot, type EstimateFrozenPayload, type Expense, type ExpenseRecord, type ExpenseAttachment, type ExpenseLine, type BankTransaction, type Invoice, type InvoicePayment, type InvoiceStatus, type InvoiceLineItem, type Commitment, type CommitmentType, type CommitmentStatus, type Worker, type LaborWorker, type LaborEntry, type LaborShiftEntry, type LaborInvoice, type LaborInvoiceSplit, type LaborInvoiceChecklist, type Attachment, type LaborPayment } from "../mock-data";

export type Project = (typeof MOCK_PROJECTS)[number];
export type RecentTransaction = (typeof MOCK_RECENT_TRANSACTIONS)[number];
export type ProjectLaborRow = (typeof MOCK_PROJECT_LABOR)[number];
export type ProjectTransactionRow = (typeof MOCK_PROJECT_TRANSACTIONS)[number];
export type { Expense, ExpenseRecord, ExpenseAttachment, ExpenseLine, BankTransaction };
export type { Commitment, CommitmentType, CommitmentStatus };
export type { Worker };
export type { LaborEntry };
export type { LaborWorker, LaborShiftEntry };
export type { LaborInvoice, LaborInvoiceSplit, LaborInvoiceChecklist };
export type { Attachment };
export type { LaborPayment };

export function getProjects(): Project[] {
  return [...MOCK_PROJECTS];
}

export function getProjectById(id: string): Project | undefined {
  return MOCK_PROJECTS.find((p) => p.id === id);
}

export function createProject(input: { name: string; budget: number; status?: Project["status"] }): Project {
  const nextNum = MOCK_PROJECTS.reduce((max, p) => Math.max(max, Number(p.id.replace(/^p/, "")) || 0), 0) + 1;
  const project: Project = {
    id: `p${nextNum}`,
    name: input.name.trim(),
    status: input.status ?? "pending",
    budget: Math.max(0, Number(input.budget) || 0),
    spent: 0,
    updated: new Date().toISOString().slice(0, 10),
  };
  MOCK_PROJECTS.push(project);
  return { ...project };
}

export function getCommitments(projectId: string): Commitment[] {
  return commitments
    .filter((c) => c.projectId === projectId)
    .map((c) => ({ ...c, attachments: [...(c.attachments ?? [])] }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Open commitments grouped to drilldown buckets (MVP mapping: PO->Materials, Subcontract->Vendor, Other->Other). */
export function getCommittedCostByCategory(projectId: string): { materials: number; labor: number; vendor: number; other: number } {
  const out = { materials: 0, labor: 0, vendor: 0, other: 0 };
  const projectCommitments = getCommitments(projectId).filter((c) => c.status === "Open");
  for (const c of projectCommitments) {
    if (c.type === "PO") out.materials += c.amount;
    else if (c.type === "Subcontract") out.vendor += c.amount;
    else out.other += c.amount;
  }
  return out;
}

export function createCommitment(payload: Omit<Commitment, "id">): Commitment {
  const commitment: Commitment = {
    ...payload,
    id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    attachments: payload.attachments ?? [],
  };
  commitments.push(commitment);
  return { ...commitment, attachments: [...commitment.attachments] };
}

export function updateCommitment(
  id: string,
  patch: Partial<Omit<Commitment, "id" | "projectId"> & { attachments: ExpenseAttachment[] }>
): boolean {
  const idx = commitments.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  const current = commitments[idx];
  commitments[idx] = {
    ...current,
    ...patch,
    attachments: patch.attachments ?? current.attachments,
  };
  return true;
}

export function deleteCommitment(id: string): boolean {
  const idx = commitments.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  commitments.splice(idx, 1);
  return true;
}

export function getLaborWorkers(): LaborWorker[] {
  return laborWorkers.filter((w) => w.status === "active").map((w) => ({ ...w }));
}

export function getWorkers(): Worker[] {
  return laborWorkers.map((w) => ({ ...w }));
}

export function createWorker(input: {
  name: string;
  phone?: string;
  trade?: string;
  status?: "active" | "inactive";
  halfDayRate: number;
  notes?: string;
}): Worker {
  const worker: Worker = {
    id: `lw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    trade: input.trade?.trim() || undefined,
    status: input.status ?? "active",
    halfDayRate: Math.max(0, input.halfDayRate),
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  laborWorkers.push(worker);
  return { ...worker };
}

export function updateWorker(
  id: string,
  patch: Partial<{
    name: string;
    phone?: string;
    trade?: string;
    status: "active" | "inactive";
    halfDayRate: number;
    notes?: string;
  }>
): Worker | null {
  const idx = laborWorkers.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  const current = laborWorkers[idx];
  const updated: Worker = {
    ...current,
    ...patch,
    name: patch.name != null ? patch.name.trim() : current.name,
    phone: patch.phone !== undefined ? patch.phone?.trim() || undefined : current.phone,
    trade: patch.trade !== undefined ? patch.trade?.trim() || undefined : current.trade,
    notes: patch.notes !== undefined ? patch.notes?.trim() || undefined : current.notes,
    halfDayRate: patch.halfDayRate != null ? Math.max(0, patch.halfDayRate) : current.halfDayRate,
  };
  laborWorkers[idx] = updated;
  return { ...updated };
}

export function getWorkerById(id: string): Worker | null {
  const w = laborWorkers.find((row) => row.id === id);
  return w ? { ...w } : null;
}

export function getWorkerUsage(id: string): { used: boolean; reason?: "entries" | "invoices" } {
  const worker = laborWorkers.find((w) => w.id === id);
  if (!worker) return { used: false };
  const hasEntries = laborEntries.some((e) => e.workerId === id);
  if (hasEntries) return { used: true, reason: "entries" };
  const hasLaborInvoiceRecords = laborInvoices.some((inv) => inv.workerId === id);
  if (hasLaborInvoiceRecords) return { used: true, reason: "invoices" };
  const lowerName = worker.name.trim().toLowerCase();
  const hasLaborInvoices = expenses.some((exp) => {
    if (exp.vendorName.trim().toLowerCase() !== lowerName) return false;
    const norm = normalizeExpense(exp);
    return norm.lines.some((l) => l.category.trim().toLowerCase() === "labor");
  }) || MOCK_PROJECT_LABOR.some((r) => r.worker.trim().toLowerCase() === lowerName);
  if (hasLaborInvoices) return { used: true, reason: "invoices" };
  return { used: false };
}

export let includeLaborInvoicesInProjectLabor = true;

export function setIncludeLaborInvoicesInProjectLabor(enabled: boolean): void {
  includeLaborInvoicesInProjectLabor = enabled;
}

/** Backward-compat alias */
export function setIncludeLaborInvoicesInLaborActual(enabled: boolean): void {
  includeLaborInvoicesInProjectLabor = enabled;
}

function cloneLaborInvoice(inv: LaborInvoice): LaborInvoice {
  return {
    ...inv,
    projectSplits: inv.projectSplits.map((s) => ({ ...s })),
    checklist: { ...inv.checklist },
    attachments: inv.attachments.map((a) => ({ ...a })),
  };
}

function normalizeLaborInvoiceChecklist(
  checklist?: Partial<LaborInvoiceChecklist>
): LaborInvoiceChecklist {
  return {
    verifiedWorker: !!checklist?.verifiedWorker,
    verifiedAmount: !!checklist?.verifiedAmount,
    verifiedAllocation: !!checklist?.verifiedAllocation,
    verifiedAttachment: !!checklist?.verifiedAttachment,
  };
}

function getLaborInvoiceNextStatus(inv: Pick<LaborInvoice, "status" | "checklist">): LaborInvoice["status"] {
  if (inv.status === "void") return "void";
  if (inv.status === "confirmed") return "confirmed";
  const allChecked =
    inv.checklist.verifiedWorker &&
    inv.checklist.verifiedAmount &&
    inv.checklist.verifiedAllocation &&
    inv.checklist.verifiedAttachment;
  return allChecked ? "reviewed" : "draft";
}

function getNextLaborInvoiceNo(): string {
  const maxSeq = laborInvoices.reduce((max, inv) => {
    const match = /^LI-(\d+)$/.exec(inv.invoiceNo ?? "");
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `LI-${String(maxSeq + 1).padStart(4, "0")}`;
}

function getLaborInvoiceValidation(inv: LaborInvoice): { ok: boolean; reason?: string } {
  if (inv.status === "void") return { ok: false, reason: "Voided invoice cannot be confirmed." };
  if (!inv.workerId) return { ok: false, reason: "Worker is required." };
  if (inv.amount <= 0) return { ok: false, reason: "Amount must be greater than 0." };
  if (inv.projectSplits.some((s) => !s.projectId || s.amount <= 0)) return { ok: false, reason: "Each split must have a project and amount > 0." };
  const splitTotal = inv.projectSplits.reduce((s, split) => s + split.amount, 0);
  if (Math.abs(inv.amount - splitTotal) > 0.005) return { ok: false, reason: "Split total must equal invoice amount." };
  const allChecked =
    inv.checklist.verifiedWorker &&
    inv.checklist.verifiedAmount &&
    inv.checklist.verifiedAllocation &&
    inv.checklist.verifiedAttachment;
  if (!allChecked) return { ok: false, reason: "Checklist must be fully verified." };
  return { ok: true };
}

export function getLaborInvoices(): LaborInvoice[] {
  return laborInvoices
    .map(cloneLaborInvoice)
    .sort((a, b) => (a.invoiceDate === b.invoiceDate ? b.createdAt.localeCompare(a.createdAt) : b.invoiceDate.localeCompare(a.invoiceDate)));
}

export function getLaborInvoiceById(id: string): LaborInvoice | null {
  const row = laborInvoices.find((inv) => inv.id === id);
  return row ? cloneLaborInvoice(row) : null;
}

export function getLaborInvoice(id: string): LaborInvoice | undefined {
  const row = laborInvoices.find((inv) => inv.id === id);
  return row ? cloneLaborInvoice(row) : undefined;
}

export function getLaborInvoicesByWorker(workerId: string): LaborInvoice[] {
  return getLaborInvoices().filter((row) => row.workerId === workerId);
}

export function createLaborInvoice(input: {
  workerId: string;
  invoiceDate?: string;
  amount?: number;
  memo?: string;
}): LaborInvoice {
  const nowDate = new Date().toISOString().slice(0, 10);
  const created: LaborInvoice = {
    id: `linv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    invoiceNo: getNextLaborInvoiceNo(),
    workerId: input.workerId,
    invoiceDate: input.invoiceDate ?? nowDate,
    amount: Number.isFinite(input.amount) ? Math.max(0, input.amount ?? 0) : 0,
    memo: input.memo?.trim() || undefined,
    projectSplits: [],
    status: "draft",
    checklist: { verifiedWorker: false, verifiedAmount: false, verifiedAllocation: false, verifiedAttachment: false },
    attachments: [],
    createdAt: nowDate,
    confirmedAt: undefined,
  };
  laborInvoices.push(created);
  return cloneLaborInvoice(created);
}

export function updateLaborInvoice(
  id: string,
  patch: Partial<{
    invoiceNo: string;
    workerId: string;
    invoiceDate: string;
    amount: number;
    memo?: string;
    projectSplits: LaborInvoiceSplit[];
    checklist: LaborInvoiceChecklist;
    status: LaborInvoice["status"];
  }>
): LaborInvoice | null {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return null;
  const current = laborInvoices[idx];
  if (current.status === "confirmed" || current.status === "void") {
    if (patch.status == null || (patch.status !== "void" && patch.status !== current.status)) {
      return cloneLaborInvoice(current);
    }
  }
  const next: LaborInvoice = {
    ...current,
    ...patch,
    invoiceNo: patch.invoiceNo ?? current.invoiceNo,
    amount: patch.amount != null ? Math.max(0, patch.amount) : current.amount,
    memo: patch.memo !== undefined ? patch.memo?.trim() || undefined : current.memo,
    projectSplits: patch.projectSplits
      ? patch.projectSplits
          .filter((s) => !!s.projectId)
          .map((s) => ({ projectId: s.projectId, amount: Number.isFinite(s.amount) ? Math.max(0, s.amount) : 0 }))
      : current.projectSplits,
    checklist: normalizeLaborInvoiceChecklist(patch.checklist ?? current.checklist),
    confirmedAt: current.confirmedAt,
  };
  next.status = patch.status ?? getLaborInvoiceNextStatus(next);
  if (next.status !== "confirmed") next.confirmedAt = undefined;
  laborInvoices[idx] = next;
  return cloneLaborInvoice(next);
}

export function deleteLaborInvoice(id: string): void {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return;
  if (laborInvoices[idx].status === "confirmed") return;
  laborInvoices.splice(idx, 1);
}

export function addLaborInvoiceAttachment(id: string, attachment: Attachment): LaborInvoice | null {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return null;
  if (laborInvoices[idx].status === "confirmed" || laborInvoices[idx].status === "void") return cloneLaborInvoice(laborInvoices[idx]);
  laborInvoices[idx].attachments.push({ ...attachment });
  return cloneLaborInvoice(laborInvoices[idx]);
}

export function deleteLaborInvoiceAttachment(id: string, attachmentId: string): LaborInvoice | null {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return null;
  if (laborInvoices[idx].status === "confirmed" || laborInvoices[idx].status === "void") return cloneLaborInvoice(laborInvoices[idx]);
  laborInvoices[idx].attachments = laborInvoices[idx].attachments.filter((a) => a.id !== attachmentId);
  return cloneLaborInvoice(laborInvoices[idx]);
}

export function markLaborInvoiceReviewed(id: string): LaborInvoice | null {
  return updateLaborInvoice(id, { status: "reviewed" });
}

export function confirmLaborInvoice(id: string): LaborInvoice | null {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return null;
  const inv = laborInvoices[idx];
  const validation = getLaborInvoiceValidation(inv);
  if (!validation.ok) return null;
  laborInvoices[idx] = {
    ...inv,
    status: "confirmed",
    checklist: normalizeLaborInvoiceChecklist(inv.checklist),
    confirmedAt: new Date().toISOString(),
  };
  return cloneLaborInvoice(laborInvoices[idx]);
}

export function voidLaborInvoice(id: string): LaborInvoice | null {
  const idx = laborInvoices.findIndex((inv) => inv.id === id);
  if (idx < 0) return null;
  laborInvoices[idx] = {
    ...laborInvoices[idx],
    status: "void",
  };
  return cloneLaborInvoice(laborInvoices[idx]);
}

export function getLaborInvoiceActualByProject(projectId: string): number {
  let total = 0;
  for (const inv of laborInvoices) {
    if (inv.status !== "confirmed") continue;
    for (const split of inv.projectSplits) {
      if (split.projectId === projectId) total += Math.max(0, split.amount);
    }
  }
  return total;
}

function inDateRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

export function getConfirmedLaborDailyTotalByWorker(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): number {
  const halfDayRate = laborWorkers.find((w) => w.id === workerId)?.halfDayRate ?? 0;
  let total = 0;
  for (const row of laborEntries) {
    if (row.status !== "confirmed") continue;
    if (row.workerId !== workerId) continue;
    if (!inDateRange(row.date, startDate, endDate)) continue;
    if (row.amWorked && (!projectId || row.amProjectId === projectId)) total += halfDayRate;
    if (row.pmWorked && (!projectId || row.pmProjectId === projectId)) total += halfDayRate;
    if (row.otAmount > 0 && (!projectId || row.otProjectId === projectId)) total += row.otAmount;
  }
  return total;
}

export function getConfirmedLaborInvoiceTotalByWorker(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): number {
  if (!includeLaborInvoicesInProjectLabor) return 0;
  let total = 0;
  for (const inv of laborInvoices) {
    if (inv.status !== "confirmed") continue;
    if (inv.workerId !== workerId) continue;
    if (!inDateRange(inv.invoiceDate, startDate, endDate)) continue;
    if (projectId) {
      total += inv.projectSplits
        .filter((split) => split.projectId === projectId)
        .reduce((sum, split) => sum + split.amount, 0);
    } else {
      total += inv.amount;
    }
  }
  return total;
}

export function getLaborPayments(workerId?: string, startDate?: string, endDate?: string): LaborPayment[] {
  return laborPayments
    .filter((p) => (workerId ? p.workerId === workerId : true))
    .filter((p) => (startDate ? p.paymentDate >= startDate : true))
    .filter((p) => (endDate ? p.paymentDate <= endDate : true))
    .map((p) => ({ ...p, attachments: p.attachments.map((a) => ({ ...a })) }))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export function getLaborPaymentsByWorker(workerId: string): LaborPayment[] {
  return getLaborPayments(workerId);
}

export function createLaborPayment(payload: Omit<LaborPayment, "id" | "createdAt">): LaborPayment {
  const now = new Date().toISOString();
  const payment: LaborPayment = {
    ...payload,
    id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    amount: Math.max(0, payload.amount),
    attachments: (payload.attachments ?? []).map((a) => ({ ...a })),
    createdAt: now,
  };
  laborPayments.push(payment);
  return { ...payment, attachments: payment.attachments.map((a) => ({ ...a })) };
}

export function deleteLaborPayment(id: string): boolean {
  const idx = laborPayments.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  laborPayments.splice(idx, 1);
  return true;
}

function getPaymentsTotalForRange(workerId: string, startDate: string, endDate: string): number {
  return getLaborPayments(workerId)
    .filter((p) => {
      if (p.appliedRange) return p.appliedRange.startDate === startDate && p.appliedRange.endDate === endDate;
      return inDateRange(p.paymentDate, startDate, endDate);
    })
    .reduce((sum, p) => sum + Math.max(0, p.amount), 0);
}

export function getWorkerPaySummary(workerId: string, startDate: string, endDate: string, projectId?: string) {
  const confirmedDailyTotal = getConfirmedLaborDailyTotalByWorker(workerId, startDate, endDate, projectId);
  const confirmedInvoiceTotal = getConfirmedLaborInvoiceTotalByWorker(workerId, startDate, endDate, projectId);
  const confirmedTotal = confirmedDailyTotal + confirmedInvoiceTotal;
  const paidTotal = getPaymentsTotalForRange(workerId, startDate, endDate);
  const balance = Math.max(0, confirmedTotal - paidTotal);
  return {
    confirmedDailyTotal,
    confirmedInvoiceTotal,
    confirmedTotal,
    paidTotal,
    balance,
  };
}

export type WorkerEarningAllocationRow = {
  date: string;
  projectId: string;
  projectName: string;
  shift: "AM" | "PM" | "OT";
  amount: number;
  notes: string | null;
};

export function getWorkerEarningsAllocations(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): WorkerEarningAllocationRow[] {
  const halfDayRate = laborWorkers.find((w) => w.id === workerId)?.halfDayRate ?? 0;
  const out: WorkerEarningAllocationRow[] = [];
  for (const row of laborEntries) {
    if (row.status !== "confirmed") continue;
    if (row.workerId !== workerId) continue;
    if (!inDateRange(row.date, startDate, endDate)) continue;
    if (row.amWorked && row.amProjectId) {
      if (!projectId || row.amProjectId === projectId) {
        out.push({
          date: row.date,
          projectId: row.amProjectId,
          projectName: getProjectById(row.amProjectId)?.name ?? row.amProjectId,
          shift: "AM",
          amount: halfDayRate,
          notes: null,
        });
      }
    }
    if (row.pmWorked && row.pmProjectId) {
      if (!projectId || row.pmProjectId === projectId) {
        out.push({
          date: row.date,
          projectId: row.pmProjectId,
          projectName: getProjectById(row.pmProjectId)?.name ?? row.pmProjectId,
          shift: "PM",
          amount: halfDayRate,
          notes: null,
        });
      }
    }
    if (row.otAmount > 0 && row.otProjectId) {
      if (!projectId || row.otProjectId === projectId) {
        out.push({
          date: row.date,
          projectId: row.otProjectId,
          projectName: getProjectById(row.otProjectId)?.name ?? row.otProjectId,
          shift: "OT",
          amount: row.otAmount,
          notes: null,
        });
      }
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)));
}

export function getWorkerPayments(workerId: string, startDate: string, endDate: string): LaborPayment[] {
  return getLaborPayments(workerId).filter((p) => inDateRange(p.paymentDate, startDate, endDate));
}

export function getWorkerLaborInvoices(workerId: string, startDate: string, endDate: string): LaborInvoice[] {
  return getLaborInvoicesByWorker(workerId).filter((inv) => inDateRange(inv.invoiceDate, startDate, endDate));
}

export function getLaborPayRunRows(startDate: string, endDate: string, projectId?: string) {
  return getWorkers().map((worker) => {
    const summary = getWorkerPaySummary(worker.id, startDate, endDate, projectId);
    return {
      workerId: worker.id,
      workerName: worker.name,
      ...summary,
      status: summary.balance > 0 ? "Outstanding" : "Paid",
      payments: getLaborPaymentsByWorker(worker.id).filter((p) => {
        if (p.appliedRange) return p.appliedRange.startDate === startDate && p.appliedRange.endDate === endDate;
        return inDateRange(p.paymentDate, startDate, endDate);
      }),
    };
  });
}

export function disableWorker(id: string): Worker | null {
  return updateWorker(id, { status: "inactive" });
}

export function deleteWorker(id: string): void {
  const usage = getWorkerUsage(id);
  if (usage.used) return;
  const idx = laborWorkers.findIndex((w) => w.id === id);
  if (idx >= 0) laborWorkers.splice(idx, 1);
}

function computeLaborEntryTotal(
  row: Pick<LaborEntry, "workerId" | "amWorked" | "pmWorked" | "otAmount">
): number {
  const worker = laborWorkers.find((w) => w.id === row.workerId);
  const halfDayRate = worker?.halfDayRate ?? 0;
  const amAmount = row.amWorked ? halfDayRate : 0;
  const pmAmount = row.pmWorked ? halfDayRate : 0;
  const otAmount = Number.isFinite(row.otAmount) ? Math.max(0, row.otAmount) : 0;
  return amAmount + pmAmount + otAmount;
}

function normalizeLaborChecklist(
  checklist?: Partial<LaborEntry["checklist"]>
): LaborEntry["checklist"] {
  return {
    verifiedWorker: !!checklist?.verifiedWorker,
    verifiedProjects: !!checklist?.verifiedProjects,
    verifiedAmount: !!checklist?.verifiedAmount,
  };
}

function getLaborEntryConfirmValidation(entry: LaborEntry): { ok: boolean; reason?: string } {
  if (!entry.workerId) return { ok: false, reason: "Worker is required." };
  if (entry.amWorked && !entry.amProjectId) return { ok: false, reason: "AM project is required." };
  if (entry.pmWorked && !entry.pmProjectId) return { ok: false, reason: "PM project is required." };
  if ((entry.otAmount ?? 0) > 0 && !entry.otProjectId) return { ok: false, reason: "OT project is required." };
  const allChecked = entry.checklist.verifiedWorker && entry.checklist.verifiedProjects && entry.checklist.verifiedAmount;
  if (!allChecked) return { ok: false, reason: "Checklist must be fully verified." };
  return { ok: true };
}

function cloneLaborEntry(entry: LaborEntry): LaborEntry {
  return {
    ...entry,
    checklist: normalizeLaborChecklist(entry.checklist),
  };
}

export function getLaborEntriesByDate(date: string): LaborEntry[] {
  return laborEntries
    .filter((row) => row.date === date)
    .map((row) => cloneLaborEntry(row))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getLaborEntries(status?: "draft" | "confirmed"): LaborEntry[] {
  const rows = status ? laborEntries.filter((row) => row.status === status) : laborEntries;
  return rows
    .map((row) => cloneLaborEntry(row))
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
}

export function upsertLaborEntry(
  entry: Omit<LaborEntry, "total" | "reviewedAt" | "checklist"> & {
    reviewedAt?: string;
    checklist?: Partial<LaborEntry["checklist"]>;
  }
): LaborEntry {
  const existing = laborEntries.find((r) => r.id === entry.id);
  const normalized: LaborEntry = {
    ...entry,
    amProjectId: entry.amProjectId || undefined,
    pmProjectId: entry.pmProjectId || undefined,
    otProjectId: entry.otProjectId || undefined,
    otAmount: Number.isFinite(entry.otAmount) ? Math.max(0, entry.otAmount) : 0,
    total: computeLaborEntryTotal(entry),
    reviewedAt: entry.status === "confirmed" ? (entry.reviewedAt ?? new Date().toISOString()) : undefined,
    checklist: normalizeLaborChecklist(entry.checklist ?? existing?.checklist),
  };
  const idx = laborEntries.findIndex((r) => r.id === normalized.id);
  if (idx >= 0) {
    laborEntries[idx] = normalized;
    return { ...laborEntries[idx] };
  }
  const created: LaborEntry = {
    ...normalized,
    id: normalized.id || `le-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  laborEntries.push(created);
  return { ...created };
}

export function clearLaborEntry(id: string): void {
  const idx = laborEntries.findIndex((r) => r.id === id);
  if (idx >= 0) laborEntries.splice(idx, 1);
}

export function confirmLaborEntry(id: string): LaborEntry | null {
  const idx = laborEntries.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const validation = getLaborEntryConfirmValidation(laborEntries[idx]);
  if (!validation.ok) return null;
  const next: LaborEntry = {
    ...laborEntries[idx],
    status: "confirmed",
    reviewedAt: new Date().toISOString(),
    total: computeLaborEntryTotal(laborEntries[idx]),
  };
  laborEntries[idx] = next;
  return { ...next };
}

export function unconfirmLaborEntry(id: string): LaborEntry | null {
  const idx = laborEntries.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: LaborEntry = {
    ...laborEntries[idx],
    status: "draft",
    reviewedAt: undefined,
    total: computeLaborEntryTotal(laborEntries[idx]),
    checklist: normalizeLaborChecklist(laborEntries[idx].checklist),
  };
  laborEntries[idx] = next;
  return { ...next };
}

/** Legacy API compatibility wrappers (old labor shift naming). */
export function getLaborShiftEntries(date?: string): LaborShiftEntry[] {
  const rows = date ? getLaborEntriesByDate(date) : laborEntries.map((r) => ({ ...r }));
  return rows.map((r) => ({ ...r }));
}

export function upsertLaborShiftEntry(
  workerId: string,
  patch: Omit<LaborShiftEntry, "id" | "workerId">
): LaborShiftEntry {
  const existing = laborEntries.find((r) => r.workerId === workerId && r.date === patch.date);
  return upsertLaborEntry({
    id: existing?.id ?? `le-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: patch.date,
    workerId,
    amWorked: patch.amWorked,
    amProjectId: patch.amProjectId ?? undefined,
    pmWorked: patch.pmWorked,
    pmProjectId: patch.pmProjectId ?? undefined,
    otAmount: patch.otAmount,
    otProjectId: patch.otProjectId ?? undefined,
    status: existing?.status ?? "draft",
    checklist: existing?.checklist ?? normalizeLaborChecklist(),
  });
}

export function deleteLaborShiftEntry(workerId: string, date: string): boolean {
  const idx = laborEntries.findIndex((r) => r.workerId === workerId && r.date === date);
  if (idx < 0) return false;
  laborEntries.splice(idx, 1);
  return true;
}

export function getLaborAllocatedByProject(projectId: string, date?: string): number {
  const workerRate = new Map(laborWorkers.map((w) => [w.id, w.halfDayRate]));
  const rows = (date ? getLaborEntriesByDate(date) : laborEntries).filter((row) => row.status === "confirmed");
  let total = 0;
  for (const r of rows) {
    const halfDayRate = workerRate.get(r.workerId) ?? 0;
    if (r.amWorked && (r.amProjectId ?? "") === projectId) total += halfDayRate;
    if (r.pmWorked && (r.pmProjectId ?? "") === projectId) total += halfDayRate;
    if ((r.otProjectId ?? "") === projectId) total += Math.max(0, r.otAmount ?? 0);
  }
  return total;
}

/** Project labor actual: only confirmed labor entries are counted. */
export function getLaborActualByProject(projectId: string): number {
  const fromEntries = getLaborAllocatedByProject(projectId);
  const fromInvoices = includeLaborInvoicesInProjectLabor ? getLaborInvoiceActualByProject(projectId) : 0;
  return fromEntries + fromInvoices;
}

export function getDashboardStats() {
  const projects = getProjects();
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + (getProjectDetailFinancial(p.id)?.totalSpent ?? p.spent), 0);
  const totalProfit = projects.reduce((s, p) => {
    const source = getSourceForProject?.(p.id) ?? null;
    const revenue = source?.snapshotRevenue ?? p.budget;
    const actualCost = getProjectDetailFinancial(p.id)?.totalSpent ?? p.spent;
    return s + (revenue - actualCost);
  }, 0);
  return { totalProjects, activeProjects, totalBudget, totalSpent, totalProfit };
}

export function getRecentTransactions(): RecentTransaction[] {
  return [...MOCK_RECENT_TRANSACTIONS];
}

export function getExpenseCategories(includeDisabled = false): string[] {
  const list = [...expenseCategories];
  if (includeDisabled) return list;
  return list.filter((c) => !disabledExpenseCategories.some((d) => d.toLowerCase() === c.toLowerCase()));
}

/** Returns the value to select (existing match or newly added). Empty string if rejected. */
export function addExpenseCategory(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const existing = expenseCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const inDisabledIdx = disabledExpenseCategories.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (inDisabledIdx >= 0) {
    disabledExpenseCategories.splice(inDisabledIdx, 1);
    return trimmed;
  }
  expenseCategories.push(trimmed);
  return trimmed;
}

export function getCategoryUsageCount(name: string): number {
  const lower = name.toLowerCase();
  let count = 0;
  for (const exp of expenses) {
    const norm = normalizeExpense(exp);
    for (const line of norm.lines) {
      if (line.category.toLowerCase() === lower) count++;
    }
  }
  return count;
}

export function renameExpenseCategory(oldName: string, newName: string): boolean {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!newTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return false;
  const idx = expenseCategories.findIndex((c) => c.toLowerCase() === oldTrim.toLowerCase());
  if (idx < 0) return false;
  const wasDisabled = disabledExpenseCategories.some((d) => d.toLowerCase() === oldTrim.toLowerCase());
  if (wasDisabled) {
    const di = disabledExpenseCategories.findIndex((d) => d.toLowerCase() === oldTrim.toLowerCase());
    if (di >= 0) disabledExpenseCategories.splice(di, 1);
    disabledExpenseCategories.push(newTrim);
  }
  expenseCategories[idx] = newTrim;
  for (const exp of expenses) {
    const norm = normalizeExpense(exp);
    for (const line of norm.lines) {
      if (line.category.toLowerCase() === oldTrim.toLowerCase()) line.category = newTrim;
    }
  }
  return true;
}

export function disableExpenseCategory(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const inList = expenseCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (!inList) return false;
  if (disabledExpenseCategories.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return true;
  const exact = expenseCategories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (exact) disabledExpenseCategories.push(exact);
  return true;
}

export function enableExpenseCategory(name: string): boolean {
  const trimmed = name.trim();
  const idx = disabledExpenseCategories.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (idx < 0) return false;
  disabledExpenseCategories.splice(idx, 1);
  return true;
}

export function deleteExpenseCategory(name: string): boolean {
  const trimmed = name.trim();
  if (getCategoryUsageCount(trimmed) > 0) return false;
  const idx = expenseCategories.findIndex((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (idx >= 0) expenseCategories.splice(idx, 1);
  const di = disabledExpenseCategories.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (di >= 0) disabledExpenseCategories.splice(di, 1);
  return true;
}

export function isExpenseCategoryDisabled(name: string): boolean {
  return disabledExpenseCategories.some((d) => d.toLowerCase() === name.trim().toLowerCase());
}

export function getVendors(includeDisabled = false): string[] {
  const list = [...vendors];
  if (includeDisabled) return list;
  return list.filter((v) => !disabledVendors.some((d) => d.toLowerCase() === v.toLowerCase()));
}

/** Returns the value to select (existing match or newly added). Empty string if rejected. */
export function addVendor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const existing = vendors.find((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const inDisabledIdx = disabledVendors.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (inDisabledIdx >= 0) {
    disabledVendors.splice(inDisabledIdx, 1);
    return trimmed;
  }
  vendors.push(trimmed);
  return trimmed;
}

export function getVendorUsageCount(name: string): number {
  const lower = name.toLowerCase();
  return expenses.filter((e) => e.vendorName.toLowerCase() === lower).length;
}

export function renameVendor(oldName: string, newName: string): boolean {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!newTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return false;
  const idx = vendors.findIndex((v) => v.toLowerCase() === oldTrim.toLowerCase());
  if (idx < 0) return false;
  const wasDisabled = disabledVendors.some((d) => d.toLowerCase() === oldTrim.toLowerCase());
  if (wasDisabled) {
    const di = disabledVendors.findIndex((d) => d.toLowerCase() === oldTrim.toLowerCase());
    if (di >= 0) disabledVendors.splice(di, 1);
    disabledVendors.push(newTrim);
  }
  vendors[idx] = newTrim;
  for (const exp of expenses) {
    if (exp.vendorName.toLowerCase() === oldTrim.toLowerCase()) exp.vendorName = newTrim;
  }
  return true;
}

export function disableVendor(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const inList = vendors.some((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (!inList) return false;
  if (disabledVendors.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return true;
  const exact = vendors.find((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (exact) disabledVendors.push(exact);
  return true;
}

export function enableVendor(name: string): boolean {
  const trimmed = name.trim();
  const idx = disabledVendors.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (idx < 0) return false;
  disabledVendors.splice(idx, 1);
  return true;
}

export function deleteVendor(name: string): boolean {
  const trimmed = name.trim();
  if (getVendorUsageCount(trimmed) > 0) return false;
  const idx = vendors.findIndex((v) => v.toLowerCase() === trimmed.toLowerCase());
  if (idx >= 0) vendors.splice(idx, 1);
  const di = disabledVendors.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (di >= 0) disabledVendors.splice(di, 1);
  return true;
}

export function isVendorDisabled(name: string): boolean {
  return disabledVendors.some((d) => d.toLowerCase() === name.trim().toLowerCase());
}

export function getPaymentMethods(includeDisabled = false): string[] {
  const list = [...paymentMethods];
  if (includeDisabled) return list;
  return list.filter((m) => !disabledPaymentMethods.some((d) => d.toLowerCase() === m.toLowerCase()));
}

/** Returns the value to select (existing match or newly added). Empty string if rejected. */
export function addPaymentMethod(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const existing = paymentMethods.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const inDisabledIdx = disabledPaymentMethods.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (inDisabledIdx >= 0) {
    disabledPaymentMethods.splice(inDisabledIdx, 1);
    return trimmed;
  }
  paymentMethods.push(trimmed);
  return trimmed;
}

export function getPaymentMethodUsageCount(name: string): number {
  const lower = name.toLowerCase();
  return expenses.filter((e) => e.paymentMethod.toLowerCase() === lower).length;
}

export function renamePaymentMethod(oldName: string, newName: string): boolean {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!newTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return false;
  const idx = paymentMethods.findIndex((m) => m.toLowerCase() === oldTrim.toLowerCase());
  if (idx < 0) return false;
  const wasDisabled = disabledPaymentMethods.some((d) => d.toLowerCase() === oldTrim.toLowerCase());
  if (wasDisabled) {
    const di = disabledPaymentMethods.findIndex((d) => d.toLowerCase() === oldTrim.toLowerCase());
    if (di >= 0) disabledPaymentMethods.splice(di, 1);
    disabledPaymentMethods.push(newTrim);
  }
  paymentMethods[idx] = newTrim;
  for (const exp of expenses) {
    if (exp.paymentMethod.toLowerCase() === oldTrim.toLowerCase()) exp.paymentMethod = newTrim;
  }
  return true;
}

export function disablePaymentMethod(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const inList = paymentMethods.some((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (!inList) return false;
  if (disabledPaymentMethods.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return true;
  const exact = paymentMethods.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (exact) disabledPaymentMethods.push(exact);
  return true;
}

export function enablePaymentMethod(name: string): boolean {
  const trimmed = name.trim();
  const idx = disabledPaymentMethods.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (idx < 0) return false;
  disabledPaymentMethods.splice(idx, 1);
  return true;
}

export function deletePaymentMethod(name: string): boolean {
  const trimmed = name.trim();
  if (getPaymentMethodUsageCount(trimmed) > 0) return false;
  const idx = paymentMethods.findIndex((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (idx >= 0) paymentMethods.splice(idx, 1);
  const di = disabledPaymentMethods.findIndex((d) => d.toLowerCase() === trimmed.toLowerCase());
  if (di >= 0) disabledPaymentMethods.splice(di, 1);
  return true;
}

export function isPaymentMethodDisabled(name: string): boolean {
  return disabledPaymentMethods.some((d) => d.toLowerCase() === name.trim().toLowerCase());
}

export function getExpenses(): Expense[] {
  return expenses.map((e) => normalizeExpense(e)).map((e) => ({ ...e, attachments: [...e.attachments], lines: [...e.lines] }));
}

export function getExpenseById(expenseId: string): Expense | null {
  const exp = expenses.find((e) => e.id === expenseId);
  if (!exp) return null;
  const normalized = normalizeExpense(exp);
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function getExpenseTotal(expense: Expense): number {
  const e = normalizeExpense(expense);
  return e.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function createExpense(payload: Partial<Omit<Expense, "id" | "attachments" | "lines">> & { attachments?: ExpenseAttachment[]; lines?: ExpenseLine[] }): Expense {
  const id = `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const defaultLine: ExpenseLine = {
    id: `line-${id}-0`,
    projectId: null,
    category: "Other",
    amount: 0,
  };
  const lines: ExpenseLine[] =
    payload.lines?.length
      ? payload.lines.map((l, i) => ({
          ...l,
          id: l.id?.startsWith("line-") ? l.id : `line-${id}-${i}`,
          projectId: l.projectId ?? null,
          category: l.category ?? "Other",
          amount: l.amount ?? 0,
        }))
      : [defaultLine];
  const record: Expense = {
    id,
    date: payload.date ?? new Date().toISOString().slice(0, 10),
    vendorName: payload.vendorName ?? "",
    paymentMethod: payload.paymentMethod ?? "Card",
    referenceNo: payload.referenceNo,
    notes: payload.notes,
    attachments: payload.attachments ? [...payload.attachments] : [],
    lines,
    linkedBankTxId: payload.linkedBankTxId ?? undefined,
  };
  expenses.push(record);
  return { ...record, attachments: [...record.attachments], lines: [...record.lines] };
}

export function updateExpense(expenseId: string, patch: Partial<Omit<Expense, "id" | "lines" | "attachments">>): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const existing = expenses[idx];
  const normalized = normalizeExpense(existing);
  const updated: Expense = {
    ...normalized,
    ...patch,
    id: existing.id,
    lines: normalized.lines,
    attachments: normalized.attachments,
  };
  expenses[idx] = updated;
  return { ...updated, attachments: [...updated.attachments], lines: [...updated.lines] };
}

export function addExpenseLine(expenseId: string, line: Partial<Omit<ExpenseLine, "id">>): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const exp = expenses[idx];
  const normalized = normalizeExpense(exp);
  const lineId = `line-${expenseId}-${Date.now()}`;
  const newLine: ExpenseLine = {
    id: lineId,
    projectId: line.projectId ?? null,
    category: line.category ?? "Other",
    costCode: line.costCode ?? null,
    memo: line.memo ?? null,
    amount: line.amount ?? 0,
  };
  normalized.lines.push(newLine);
  expenses[idx] = normalized;
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function updateExpenseLine(expenseId: string, lineId: string, patch: Partial<ExpenseLine>): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const exp = expenses[idx];
  const normalized = normalizeExpense(exp);
  const lineIdx = normalized.lines.findIndex((l) => l.id === lineId);
  if (lineIdx < 0) return null;
  normalized.lines[lineIdx] = { ...normalized.lines[lineIdx], ...patch, id: normalized.lines[lineIdx].id };
  expenses[idx] = normalized;
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function deleteExpenseLine(expenseId: string, lineId: string): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const exp = expenses[idx];
  const normalized = normalizeExpense(exp);
  if (normalized.lines.length <= 1) {
    normalized.lines[0] = { id: normalized.lines[0].id, projectId: null, category: "Other", amount: 0 };
    expenses[idx] = normalized;
    return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
  }
  const lineIdx = normalized.lines.findIndex((l) => l.id === lineId);
  if (lineIdx < 0) return null;
  normalized.lines.splice(lineIdx, 1);
  expenses[idx] = normalized;
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function deleteExpense(expenseId: string): boolean {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return false;
  expenses.splice(idx, 1);
  return true;
}

export function addExpenseAttachment(expenseId: string, attachment: ExpenseAttachment): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const exp = expenses[idx];
  const normalized = normalizeExpense(exp);
  normalized.attachments.push(attachment);
  expenses[idx] = normalized;
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function deleteExpenseAttachment(expenseId: string, attachmentId: string): Expense | null {
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return null;
  const exp = expenses[idx];
  const normalized = normalizeExpense(exp);
  const aIdx = normalized.attachments.findIndex((a) => a.id === attachmentId);
  if (aIdx < 0) return null;
  normalized.attachments.splice(aIdx, 1);
  expenses[idx] = normalized;
  return { ...normalized, attachments: [...normalized.attachments], lines: [...normalized.lines] };
}

export function getExpenseTotalsByProject(projectId: string): number {
  return expenses.reduce((sum, exp) => {
    const e = normalizeExpense(exp);
    return sum + e.lines.filter((l) => l.projectId === projectId).reduce((s, l) => s + l.amount, 0);
  }, 0);
}

export function getTotalExpenses(): number {
  return expenses.reduce((sum, exp) => sum + getExpenseTotal(exp), 0);
}

/** Last N expense lines for a project (for project detail). */
export function getExpenseLinesByProject(projectId: string, limit = 5): Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> {
  const result: Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> = [];
  for (const exp of expenses) {
    const normalized = normalizeExpense(exp);
    for (const line of normalized.lines) {
      if (line.projectId === projectId) result.push({ expenseId: exp.id, date: normalized.date, vendorName: normalized.vendorName, line });
    }
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result.slice(0, limit);
}

/** All expense lines for a project (for profit drilldown). Sorted by date desc. Returns [] when no data. */
export function getProjectExpenseLines(projectId: string): Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> {
  const result: Array<{ expenseId: string; date: string; vendorName: string; line: ExpenseLine }> = [];
  for (const exp of expenses) {
    const normalized = normalizeExpense(exp);
    for (const line of normalized.lines) {
      if (line.projectId === projectId) result.push({ expenseId: exp.id, date: normalized.date, vendorName: normalized.vendorName, line });
    }
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

/** Map expense line category to drilldown bucket (Materials/Labor/Vendor/Other). */
function categoryToDrilldownBucket(category: string): "Materials" | "Labor" | "Vendor" | "Other" {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "materials") return "Materials";
  if (c === "labor") return "Labor";
  if (c === "subcontractor") return "Vendor";
  return "Other";
}

/** Category spend by project (Materials/Labor/Vendor/Other). Returns zeroed object when no data. */
export function getCategorySpendByProject(projectId: string): { materials: number; labor: number; vendor: number; other: number } {
  const out = { materials: 0, labor: 0, vendor: 0, other: 0 };
  const keyMap: Record<"Materials" | "Labor" | "Vendor" | "Other", keyof typeof out> = {
    Materials: "materials",
    Labor: "labor",
    Vendor: "vendor",
    Other: "other",
  };
  for (const exp of expenses) {
    const normalized = normalizeExpense(exp);
    for (const line of normalized.lines) {
      if (line.projectId !== projectId) continue;
      const bucket = categoryToDrilldownBucket(line.category ?? "Other");
      out[keyMap[bucket]] += line.amount ?? 0;
    }
  }
  return out;
}

export interface VendorSpendRow {
  vendorName: string;
  total: number;
  txCount: number;
  lastDate: string;
}

/** Vendor spend aggregation for a project. Sorted by total desc. Returns [] when no data. */
export function getVendorSpendByProject(projectId: string): VendorSpendRow[] {
  const byVendor: Record<string, { total: number; count: number; lastDate: string }> = {};
  for (const exp of expenses) {
    const normalized = normalizeExpense(exp);
    let hasProjectLine = false;
    let lineTotal = 0;
    for (const line of normalized.lines) {
      if (line.projectId === projectId) {
        hasProjectLine = true;
        lineTotal += line.amount ?? 0;
      }
    }
    if (!hasProjectLine || lineTotal === 0) continue;
    const v = normalized.vendorName?.trim() || "—";
    if (!byVendor[v]) byVendor[v] = { total: 0, count: 0, lastDate: normalized.date };
    byVendor[v].total += lineTotal;
    byVendor[v].count += 1;
    if (normalized.date > byVendor[v].lastDate) byVendor[v].lastDate = normalized.date;
  }
  return Object.entries(byVendor)
    .map(([vendorName, d]) => ({ vendorName, total: d.total, txCount: d.count, lastDate: d.lastDate }))
    .sort((a, b) => b.total - a.total);
}

export interface ProjectCashFlowPoint {
  date: string;
  cumulativeIncome: number;
  cumulativeExpense: number;
  netCash: number;
}

export interface ProjectCashFlowData {
  points: ProjectCashFlowPoint[];
  totalIncome: number;
  totalExpense: number;
  netPosition: number;
}

/** Cash flow series for a project: income transactions + expense lines, sorted by date ascending. Mock-only. */
export function getProjectCashFlowData(projectId: string): ProjectCashFlowData {
  const incomeByDate: Record<string, number> = {};
  const expenseByDate: Record<string, number> = {};
  const projectTxs = getProjectTransactions(projectId);
  for (const tx of projectTxs) {
    if (tx.type === "income" && tx.amount > 0) {
      incomeByDate[tx.date] = (incomeByDate[tx.date] ?? 0) + tx.amount;
    }
  }
  for (const exp of expenses) {
    const normalized = normalizeExpense(exp);
    for (const line of normalized.lines) {
      if (line.projectId === projectId) {
        const amt = line.amount ?? 0;
        expenseByDate[normalized.date] = (expenseByDate[normalized.date] ?? 0) + amt;
      }
    }
  }
  const dates = Array.from(new Set([...Object.keys(incomeByDate), ...Object.keys(expenseByDate)])).sort();
  let cumIncome = 0;
  let cumExpense = 0;
  const points: ProjectCashFlowPoint[] = [];
  for (const date of dates) {
    cumIncome += incomeByDate[date] ?? 0;
    cumExpense += expenseByDate[date] ?? 0;
    points.push({
      date,
      cumulativeIncome: cumIncome,
      cumulativeExpense: cumExpense,
      netCash: cumIncome - cumExpense,
    });
  }
  const totalIncome = cumIncome;
  const totalExpense = cumExpense;
  return {
    points,
    totalIncome,
    totalExpense,
    netPosition: totalIncome - totalExpense,
  };
}

export function getBankTransactions(): BankTransaction[] {
  return [...bankTransactions];
}

export interface CashOverview {
  bankBalance: number;
  systemExpenses: number;
  reconciledBankTotal: number;
  unreconciledBankTotal: number;
  cashDifference: number;
  recentUnreconciled: BankTransaction[];
}

export function getCashOverview(): CashOverview {
  const txs = getBankTransactions();
  const bankBalance = txs.reduce((s, t) => s + t.amount, 0);
  const systemExpenses = getTotalExpenses();
  const reconciledBankTotal = txs.filter((t) => t.status === "reconciled").reduce((s, t) => s + t.amount, 0);
  const unreconciledBankTotal = txs.filter((t) => t.status === "unmatched").reduce((s, t) => s + t.amount, 0);
  const cashDifference = bankBalance - systemExpenses;
  const recentUnreconciled = txs
    .filter((t) => t.status === "unmatched")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return {
    bankBalance,
    systemExpenses,
    reconciledBankTotal,
    unreconciledBankTotal,
    cashDifference,
    recentUnreconciled,
  };
}

export type { Invoice, InvoicePayment, InvoiceStatus, InvoiceLineItem };

function safeInvoices(): Invoice[] {
  return Array.isArray(invoices) ? invoices : [];
}

function safeInvoicePayments(): InvoicePayment[] {
  return Array.isArray(invoicePayments) ? invoicePayments : [];
}

export function getInvoices(): Invoice[] {
  return safeInvoices().map((i) => ({ ...i, lineItems: i.lineItems.map((l) => ({ ...l })) }));
}

export function getInvoicePayments(): InvoicePayment[] {
  return safeInvoicePayments().map((p) => ({ ...p }));
}

function getPaymentsForInvoice(invoiceId: string): InvoicePayment[] {
  return safeInvoicePayments().filter((p) => p.invoiceId === invoiceId);
}

function computeInvoiceDerived(inv: Invoice): { paidTotal: number; balanceDue: number; status: InvoiceStatus } {
  if (inv.status === "Void") {
    const payments = getPaymentsForInvoice(inv.id);
    const paidTotal = payments.filter((p) => p.status !== "Voided").reduce((s, p) => s + p.amount, 0);
    return { paidTotal, balanceDue: 0, status: "Void" };
  }
  const payments = getPaymentsForInvoice(inv.id);
  const paidTotal = payments.filter((p) => p.status !== "Voided").reduce((s, p) => s + p.amount, 0);
  const balanceDue = Math.max(0, inv.total - paidTotal);
  let status: InvoiceStatus = inv.status;
  if (paidTotal >= inv.total) status = "Paid";
  else if (paidTotal > 0) status = "Partially Paid";
  else if (inv.status !== "Draft") status = "Sent";
  return { paidTotal, balanceDue, status };
}

export interface InvoiceWithDerived extends Invoice {
  paidTotal: number;
  balanceDue: number;
  computedStatus: InvoiceStatus;
}

export function getInvoicesWithDerived(filters?: { status?: InvoiceStatus; projectId?: string; search?: string }): InvoiceWithDerived[] {
  let list = safeInvoices().map((inv) => {
    const { paidTotal, balanceDue, status: computedStatus } = computeInvoiceDerived(inv);
    return { ...inv, paidTotal, balanceDue, computedStatus };
  });
  if (filters?.status) list = list.filter((i) => i.computedStatus === filters.status);
  if (filters?.projectId) list = list.filter((i) => i.projectId === filters.projectId);
  if (filters?.search?.trim()) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (i) =>
        i.invoiceNo.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        (getProjectById(i.projectId)?.name ?? "").toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return list;
}

export function getInvoiceById(id: string): InvoiceWithDerived | null {
  const inv = safeInvoices().find((i) => i.id === id);
  if (!inv) return null;
  const { paidTotal, balanceDue, status: computedStatus } = computeInvoiceDerived(inv);
  return { ...inv, paidTotal, balanceDue, computedStatus };
}

export function getPaymentsByInvoiceId(invoiceId: string): InvoicePayment[] {
  return getPaymentsForInvoice(invoiceId).sort((a, b) => b.date.localeCompare(a.date));
}

export function recordInvoicePayment(invoiceId: string, payload: { date: string; amount: number; method: string; memo?: string }): InvoicePayment | null {
  const inv = safeInvoices().find((i) => i.id === invoiceId);
  if (!inv || inv.status === "Void") return null;
  const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const payment: InvoicePayment = {
    id,
    invoiceId,
    date: payload.date,
    amount: payload.amount,
    method: payload.method,
    memo: payload.memo,
    status: "Posted",
  };
  invoicePayments.push(payment);
  return payment;
}

export function deleteInvoicePayment(paymentId: string): boolean {
  const idx = invoicePayments.findIndex((p) => p.id === paymentId);
  if (idx < 0) return false;
  invoicePayments.splice(idx, 1);
  return true;
}

export function voidInvoice(invoiceId: string): boolean {
  const inv = safeInvoices().find((i) => i.id === invoiceId);
  if (!inv) return false;
  inv.status = "Void";
  return true;
}

export function createInvoice(payload: {
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  taxPct?: number;
  notes?: string;
}): Invoice {
  const nextNum = safeInvoices().length + 1;
  const invoiceNo = `INV-${String(nextNum).padStart(4, "0")}`;
  const subtotal = payload.lineItems.reduce((s, l) => s + l.amount, 0);
  const taxPct = payload.taxPct ?? 0;
  const taxAmount = Math.round(subtotal * (taxPct / 100));
  const total = subtotal + taxAmount;
  const inv: Invoice = {
    id: `inv-${nextNum}-${Date.now()}`,
    invoiceNo,
    projectId: payload.projectId,
    clientName: payload.clientName,
    issueDate: payload.issueDate,
    dueDate: payload.dueDate,
    status: "Draft",
    lineItems: payload.lineItems,
    subtotal,
    taxPct: taxPct || undefined,
    taxAmount: taxAmount || undefined,
    total,
    notes: payload.notes,
  };
  invoices.push(inv);
  return inv;
}

export function updateInvoice(
  invoiceId: string,
  payload: Partial<{ issueDate: string; dueDate: string; lineItems: InvoiceLineItem[]; taxPct: number; notes: string }>
): boolean {
  const inv = safeInvoices().find((i) => i.id === invoiceId);
  if (!inv || inv.status !== "Draft") return false;
  if (payload.issueDate != null) inv.issueDate = payload.issueDate;
  if (payload.dueDate != null) inv.dueDate = payload.dueDate;
  if (payload.lineItems != null) {
    inv.lineItems = payload.lineItems;
    inv.subtotal = payload.lineItems.reduce((s, l) => s + l.amount, 0);
    const taxPct = inv.taxPct ?? 0;
    inv.taxAmount = Math.round(inv.subtotal * (taxPct / 100));
    inv.total = inv.subtotal + (inv.taxAmount ?? 0);
  }
  if (payload.taxPct != null) {
    inv.taxPct = payload.taxPct;
    inv.taxAmount = Math.round(inv.subtotal * (payload.taxPct / 100));
    inv.total = inv.subtotal + (inv.taxAmount ?? 0);
  }
  if (payload.notes !== undefined) inv.notes = payload.notes;
  return true;
}

export function markInvoiceSent(invoiceId: string): boolean {
  const inv = safeInvoices().find((i) => i.id === invoiceId);
  if (!inv || inv.status !== "Draft") return false;
  inv.status = "Sent";
  return true;
}

export function duplicateInvoice(invoiceId: string): Invoice | null {
  const inv = safeInvoices().find((i) => i.id === invoiceId);
  if (!inv || inv.status === "Void") return null;
  const now = new Date().toISOString().slice(0, 10);
  return createInvoice({
    projectId: inv.projectId,
    clientName: inv.clientName,
    issueDate: now,
    dueDate: now,
    lineItems: inv.lineItems.map((l) => ({ ...l })),
    taxPct: inv.taxPct,
    notes: inv.notes,
  });
}

function getInvoiceListByProject(projectId: string): Invoice[] {
  return getInvoices().filter((i) => i.projectId === projectId);
}

export interface ProjectInvoiceARAggregate {
  invoicedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  overdueBalance: number;
}

export function getInvoicesByProject(projectId: string): ProjectInvoiceARAggregate {
  const today = new Date().toISOString().slice(0, 10);
  const projectInvoices = getInvoiceListByProject(projectId).filter((i) => i.status !== "Void");
  let invoicedTotal = 0;
  let paidTotal = 0;
  let overdueBalance = 0;
  for (const inv of projectInvoices) {
    const { paidTotal: paid, balanceDue, status } = computeInvoiceDerived(inv);
    invoicedTotal += inv.total;
    paidTotal += paid;
    if (status !== "Paid" && inv.dueDate < today) overdueBalance += balanceDue;
  }
  return {
    invoicedTotal,
    paidTotal,
    balanceTotal: Math.max(0, invoicedTotal - paidTotal),
    overdueBalance,
  };
}

export function getInvoicePaymentsByProject(projectId: string): InvoicePayment[] {
  const invoiceIds = new Set(getInvoiceListByProject(projectId).map((i) => i.id));
  return getInvoicePayments().filter((p) => invoiceIds.has(p.invoiceId));
}

export function getProjectRevenueFromInvoices(projectId: string): number {
  return getInvoicesByProject(projectId).invoicedTotal;
}

export function getProjectCollectedFromInvoicePayments(projectId: string): number {
  return getInvoicesByProject(projectId).paidTotal;
}

export function getProjectARBalance(projectId: string): number {
  const revenue = getProjectRevenueFromInvoices(projectId);
  const collected = getProjectCollectedFromInvoicePayments(projectId);
  return Math.max(0, revenue - collected);
}

export interface ARSummary {
  totalAR: number;
  overdueAR: number;
  paidThisMonth: number;
}

export function getARSummary(): ARSummary {
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = today.slice(0, 7) + "-01";
  let totalAR = 0;
  let overdueAR = 0;
  let paidThisMonth = 0;
  for (const inv of safeInvoices()) {
    const { balanceDue, status } = computeInvoiceDerived(inv);
    if (status === "Void") continue;
    if (status === "Sent" || status === "Partially Paid") {
      totalAR += balanceDue;
      if (inv.dueDate < today) overdueAR += balanceDue;
    }
  }
  for (const p of safeInvoicePayments()) {
    if (p.status !== "Voided" && p.date >= startOfMonth && p.date <= today) paidThisMonth += p.amount;
  }
  return { totalAR, overdueAR, paidThisMonth };
}

export function getOutstandingInvoices(): InvoiceWithDerived[] {
  return getInvoicesWithDerived().filter((i) => i.computedStatus === "Sent" || i.computedStatus === "Partially Paid");
}

export function getProjectBillingSummary(projectId: string): {
  invoicedTotal: number;
  paidTotal: number;
  arBalance: number;
  lastPaymentDate: string | null;
} {
  const projectInvoices = getInvoicesWithDerived({ projectId }).filter((i) => i.computedStatus !== "Void");
  let invoicedTotal = 0;
  let paidTotal = 0;
  let arBalance = 0;
  let lastPaymentDate: string | null = null;
  for (const inv of projectInvoices) {
    invoicedTotal += inv.total;
    paidTotal += inv.paidTotal;
    arBalance += inv.balanceDue;
    const payments = getPaymentsForInvoice(inv.id);
    for (const p of payments) {
      if (!lastPaymentDate || p.date > lastPaymentDate) lastPaymentDate = p.date;
    }
  }
  return { invoicedTotal, paidTotal, arBalance, lastPaymentDate };
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

export function importBankTransactionsFromCsv(csvText: string): BankTransaction[] {
  const lines = csvText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerRow = parseCsvRow(lines[0]);
  const colMap = new Map<string, number>();
  headerRow.forEach((col, i) => {
    const key = col.replace(/^"|"$/g, "").trim().toLowerCase();
    colMap.set(key, i);
  });
  const getIdx = (...names: string[]): number => {
    const entries = Array.from(colMap.entries());
    for (const n of names) {
      for (const [k, idx] of entries) {
        if (k.includes(n)) return idx;
      }
    }
    return -1;
  };
  const dateIdx = getIdx("date", "posting");
  const descIdx = getIdx("description", "desc");
  const amountIdx = getIdx("amount");
  const debitIdx = getIdx("debit");
  const creditIdx = getIdx("credit");
  const now = new Date().toISOString().slice(0, 10);
  const created: BankTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const rawDate = dateIdx >= 0 && cols[dateIdx] != null ? cols[dateIdx].replace(/^"|"$/g, "").trim() : now;
    const date = rawDate.length >= 10 ? rawDate.slice(0, 10) : now;
    const description = descIdx >= 0 && cols[descIdx] != null ? cols[descIdx].replace(/^"|"$/g, "").trim() : "";
    let amount = 0;
    if (debitIdx >= 0 && cols[debitIdx] != null && String(cols[debitIdx]).trim() !== "") {
      const val = parseFloat(String(cols[debitIdx]).replace(/[,"\s]/g, "")) || 0;
      amount = -Math.abs(val);
    } else if (creditIdx >= 0 && cols[creditIdx] != null && String(cols[creditIdx]).trim() !== "") {
      const val = parseFloat(String(cols[creditIdx]).replace(/[,"\s]/g, "")) || 0;
      amount = Math.abs(val);
    } else if (amountIdx >= 0 && cols[amountIdx] != null) {
      amount = parseFloat(String(cols[amountIdx]).replace(/[,"\s]/g, "")) || 0;
    }
    const id = `bt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
    const tx: BankTransaction = { id, date, description, amount, status: "unmatched", createdAt: now };
    bankTransactions.push(tx);
    created.push(tx);
  }
  return created;
}

export interface ReconcileParams {
  bankTxId: string;
  type: "Expense" | "Income" | "Transfer";
  /** For single-line reconcile (legacy). Ignored when lines is provided. */
  projectId?: string | null;
  category?: string;
  vendorName?: string;
  paymentMethod?: string;
  memo?: string;
  /** Split lines for Expense. When provided, creates expense with these lines; amounts must sum to |bankTx.amount|. */
  lines?: Array<{ projectId: string | null; category: string; memo?: string | null; amount: number }>;
}

export function reconcileBankTransaction(params: ReconcileParams): BankTransaction | null {
  const tx = bankTransactions.find((t) => t.id === params.bankTxId);
  if (!tx) return null;
  const now = new Date().toISOString().slice(0, 10);
  if (params.type === "Expense") {
    const targetAmount = Math.abs(tx.amount);
    const useLines = params.lines && params.lines.length > 0;
    const linePayload = useLines
      ? params.lines!.map((l, i) => ({
          id: `line-${tx.id}-${i}`,
          projectId: l.projectId ?? null,
          category: l.category ?? "Other",
          memo: l.memo ?? null,
          amount: l.amount ?? 0,
        }))
      : [
          {
            id: `line-${tx.id}-0`,
            projectId: params.projectId ?? null,
            category: params.category ?? "Other",
            memo: params.memo ?? tx.description ?? null,
            amount: targetAmount,
          },
        ];
    const expense = createExpense({
      date: tx.date,
      vendorName: params.vendorName ?? tx.description,
      paymentMethod: params.paymentMethod ?? "ACH",
      notes: useLines ? undefined : params.memo,
      lines: linePayload,
      linkedBankTxId: tx.id,
    });
    tx.linkedExpenseId = expense.id;
  }
  tx.status = "reconciled";
  tx.reconciledAt = now;
  tx.reconciledBy = "owner";
  return { ...tx };
}

/** Link an existing expense to this bank transaction (1:1). Fails if either is already linked elsewhere. */
export function linkBankTransactionToExpense(bankTxId: string, expenseId: string): boolean {
  const tx = bankTransactions.find((t) => t.id === bankTxId);
  const expIdx = expenses.findIndex((e) => e.id === expenseId);
  if (!tx || expIdx < 0) return false;
  if (tx.linkedExpenseId) return false;
  const exp = expenses[expIdx];
  const normalized = normalizeExpense(exp);
  if (normalized.linkedBankTxId && normalized.linkedBankTxId !== bankTxId) return false;
  const now = new Date().toISOString().slice(0, 10);
  tx.linkedExpenseId = expenseId;
  (normalized as Expense).linkedBankTxId = bankTxId;
  tx.status = "reconciled";
  tx.reconciledAt = now;
  tx.reconciledBy = "owner";
  expenses[expIdx] = normalized;
  return true;
}

/** Unlink bank transaction from expense; both sides cleared, bank tx becomes unmatched. */
export function unlinkBankTransaction(bankTxId: string): boolean {
  const tx = bankTransactions.find((t) => t.id === bankTxId);
  if (!tx || !tx.linkedExpenseId) return false;
  const expenseId = tx.linkedExpenseId;
  const expIdx = expenses.findIndex((e) => e.id === expenseId);
  tx.linkedExpenseId = undefined;
  tx.status = "unmatched";
  delete tx.reconciledAt;
  delete tx.reconciledBy;
  if (expIdx >= 0) {
    const exp = expenses[expIdx];
    const normalized = normalizeExpense(exp);
    (normalized as Expense).linkedBankTxId = undefined;
    expenses[expIdx] = normalized;
  }
  return true;
}

export interface ExpenseSuggestion {
  expense: Expense;
  total: number;
  score: number;
  /** Primary project name or "Overhead" */
  projectLabel: string;
  /** First line category or "—" */
  categoryLabel: string;
  /** First line memo or "—" */
  memoLabel: string;
}

/** Up to 8 suggested expenses for linking: unlinked only, sorted by match score (amount, date proximity, vendor). */
export function getSuggestedExpensesForBankTx(bankTx: BankTransaction): ExpenseSuggestion[] {
  const targetAmount = Math.abs(bankTx.amount);
  const txDate = new Date(bankTx.date).getTime();
  const descLower = bankTx.description.toLowerCase();
  const unlinked = expenses.filter((e) => {
    const norm = normalizeExpense(e);
    return !(norm as Expense).linkedBankTxId;
  });
  const withScore: ExpenseSuggestion[] = unlinked.map((exp) => {
    const norm = normalizeExpense(exp);
    const total = norm.lines.reduce((s, l) => s + l.amount, 0);
    let score = 0;
    if (total > 0 && Math.abs(total - targetAmount) < 0.01) score += 100;
    const expDate = new Date(norm.date).getTime();
    const daysDiff = Math.abs((txDate - expDate) / (24 * 60 * 60 * 1000));
    if (daysDiff <= 3) score += Math.max(0, 30 - daysDiff * 10);
    if (norm.vendorName && descLower.includes(norm.vendorName.toLowerCase())) score += 20;
    if (norm.vendorName && norm.vendorName.toLowerCase().includes(descLower)) score += 20;
    const projectId = norm.lines[0]?.projectId;
    const projectLabel = projectId ? (getProjectById(projectId)?.name ?? projectId) : "Overhead";
    const categoryLabel = norm.lines[0]?.category ?? "—";
    const memoLabel = norm.lines[0]?.memo?.trim() || "—";
    return {
      expense: norm as Expense,
      total,
      score,
      projectLabel,
      categoryLabel,
      memoLabel,
    };
  });
  return withScore
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function getProjectLabor(projectId: string): ProjectLaborRow[] {
  return MOCK_PROJECT_LABOR.filter((r) => r.projectId === projectId);
}

export function getProjectTransactions(projectId: string): ProjectTransactionRow[] {
  return MOCK_PROJECT_TRANSACTIONS.filter((r) => r.projectId === projectId);
}

export function getProjectEstimate(projectId: string) {
  return projectEstimates.find((e) => e.projectId === projectId);
}

export type CostCode = (typeof costCodeMaster)[number];
export type EstimateListItem = (typeof estimateList)[number];
export type EstimateItemRow = (typeof estimateItems)[number];
export type { EstimateSnapshot, EstimateFrozenPayload };

export function getEstimateSnapshots(estimateId: string): EstimateSnapshot[] {
  return getEstimateSnapshotsByEstimateId(estimateId);
}

export function getEstimateSnapshot(estimateId: string, version: number): EstimateSnapshot | undefined {
  return getEstimateSnapshotByVersion(estimateId, version);
}

export function createEstimateSnapshot(estimateId: string): EstimateSnapshot | null {
  return createEstimateSnapshotMock(estimateId);
}

export function createNewVersionFromSnapshot(estimateId: string): boolean {
  return createNewVersionFromSnapshotMock(estimateId);
}

export function convertEstimateSnapshotToProject(estimateId: string) {
  return convertEstimateSnapshotToProjectMock(estimateId);
}

export function setEstimateStatus(estimateId: string, nextStatus: "Sent" | "Approved" | "Converted"): boolean {
  return setEstimateStatusMock(estimateId, nextStatus);
}

export function getProjectFromEstimate(estimateId: string) {
  return projectsFromEstimates.find((p) => p.sourceEstimateId === estimateId) ?? null;
}

export function getSourceForProject(projectId: string) {
  return projectsFromEstimates.find((p) => p.projectId === projectId) ?? null;
}

export function getCostCodes(): CostCode[] {
  return [...costCodeMaster];
}

export function getEstimateById(id: string): EstimateListItem | undefined {
  return estimateList.find((e) => e.id === id);
}

export function getEstimateList(): EstimateListItem[] {
  return [...estimateList];
}

export function getEstimateItems(estimateId: string): EstimateItemRow[] {
  return estimateItems.filter((e) => e.estimateId === estimateId);
}

export function getEstimateMeta(estimateId: string) {
  return estimateMeta[estimateId] ?? null;
}

export function updateEstimateMeta(
  estimateId: string,
  payload: { client?: { name?: string; phone?: string; email?: string; address?: string }; project?: { name?: string; siteAddress?: string } }
): boolean {
  return updateEstimateMetaMock(estimateId, payload);
}

export function addLineItem(
  estimateId: string,
  item: { costCode: string; desc: string; qty: number; unit: string; unitCost: number; markupPct: number }
) {
  return addLineItemMock(estimateId, item);
}

export function updateLineItem(
  estimateId: string,
  itemId: string,
  payload: { desc?: string; qty?: number; unit?: string; unitCost?: number; markupPct?: number }
): boolean {
  return updateLineItemMock(estimateId, itemId, payload);
}

export function deleteLineItem(estimateId: string, itemId: string): boolean {
  return deleteLineItemMock(estimateId, itemId);
}

export function createEstimate(payload: { clientName: string; projectName: string; address: string }): string {
  return createEstimateMock(payload);
}

export function estimateLineTotal(row: EstimateItemRow): number {
  return row.qty * row.unitCost * (1 + row.markupPct);
}

const ESTIMATE_OVERHEAD_PCT = 0.05;
const ESTIMATE_PROFIT_PCT = 0.1;

export function getEstimateSummary(estimateId: string): { subtotal: number; overheadPct: number; profitPct: number; overhead: number; profit: number; grandTotal: number } | null {
  const items = getEstimateItems(estimateId);
  const subtotal = items.reduce((s, row) => s + estimateLineTotal(row), 0);
  const overhead = subtotal * ESTIMATE_OVERHEAD_PCT;
  const profit = subtotal * ESTIMATE_PROFIT_PCT;
  const grandTotal = subtotal + overhead + profit;
  return {
    subtotal,
    overheadPct: ESTIMATE_OVERHEAD_PCT,
    profitPct: ESTIMATE_PROFIT_PCT,
    overhead,
    profit,
    grandTotal,
  };
}

export function getEstimateSummaryFromPayload(payload: EstimateFrozenPayload): { subtotal: number; overheadPct: number; profitPct: number; overhead: number; profit: number; grandTotal: number } {
  const subtotal = payload.items.reduce((s, row) => s + estimateLineTotal(row as EstimateItemRow), 0);
  const overhead = subtotal * payload.overheadPct;
  const profit = subtotal * payload.profitPct;
  const grandTotal = subtotal + overhead + profit;
  return {
    subtotal,
    overheadPct: payload.overheadPct,
    profitPct: payload.profitPct,
    overhead,
    profit,
    grandTotal,
  };
}

export interface ProjectDetailFinancial {
  totalBudget: number;
  totalRevenue: number;
  totalSpent: number;
  /** Cash flow: total income (defaults from totalRevenue when absent) */
  incomeTotal?: number;
  /** Cash flow: total expenses (defaults from totalSpent when absent) */
  expenseTotal?: number;
  profit: number;
  marginPct: number;
  budgetUsagePct: number;
  remainingBudget: number;
  riskStatus: string;
  materialCost: number;
  laborCost: number;
  vendorCost: number;
  otherCost: number;
}

export function getProjectDetailFinancial(projectId: string): ProjectDetailFinancial | null {
  const project = getProjectById(projectId);
  if (!project) return null;

  const override = MOCK_PROJECT_FINANCIAL_OVERRIDES[projectId];
  if (override) {
    const { incomeTotal, expenseTotal: overrideExpenseTotal, laborCost: laborCostAbs } = override;
    const laborAllocated = getLaborActualByProject(projectId);
    const laborCostAbsFinal = laborCostAbs + laborAllocated;
    const expenseTotalForProject = getExpenseTotalsByProject(projectId);
    const expenseTotal = overrideExpenseTotal + expenseTotalForProject + laborAllocated;
    const materialCostAbs = override.materialCost ?? Math.round((overrideExpenseTotal - laborCostAbs) * 0.59);
    const vendorCostAbs = override.vendorCost ?? Math.round((overrideExpenseTotal - laborCostAbs) * 0.29);
    const otherCostAbs = override.otherCost ?? (overrideExpenseTotal - laborCostAbs - materialCostAbs - vendorCostAbs);
    const profit = incomeTotal - expenseTotal;
    const marginPct = incomeTotal > 0 ? (profit / incomeTotal) * 100 : 0;
    const totalBudget = project.budget;
    const budgetUsagePct = totalBudget > 0 ? (expenseTotal / totalBudget) * 100 : 0;
    const remainingBudget = totalBudget - expenseTotal;
    let riskStatus: string;
    if (profit < 0) riskStatus = "Loss";
    else if (budgetUsagePct >= 100) riskStatus = "Over budget";
    else if (budgetUsagePct >= 80) riskStatus = "At risk";
    else riskStatus = "On track";
    return {
      totalBudget,
      totalRevenue: incomeTotal,
      totalSpent: expenseTotal,
      incomeTotal,
      expenseTotal,
      profit,
      marginPct,
      budgetUsagePct,
      remainingBudget,
      riskStatus,
      materialCost: -materialCostAbs,
      laborCost: -laborCostAbsFinal,
      vendorCost: -vendorCostAbs,
      otherCost: -otherCostAbs,
    };
  }

  const totalBudget = project.budget;
  const totalSpent = project.spent;
  const laborAllocated = getLaborActualByProject(projectId);
  const expenseTotalForProject = getExpenseTotalsByProject(projectId);
  const actualCost = totalSpent + expenseTotalForProject + laborAllocated;

  const materialsCost = Math.round(totalSpent * 0.4);
  const laborCost = Math.round(totalSpent * 0.35) + laborAllocated;
  const vendorCost = Math.round(totalSpent * 0.15);
  const otherCost = totalSpent - materialsCost - laborCost - vendorCost;

  const fromEstimate = getSourceForProject(projectId)?.snapshotRevenue != null;
  const totalRevenue = fromEstimate ? totalBudget : totalBudget * 1.1;
  const profit = totalRevenue - actualCost;
  const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const budgetUsagePct = totalBudget > 0 ? (actualCost / totalBudget) * 100 : 0;
  const remainingBudget = totalBudget - actualCost;

  let riskStatus: string;
  if (profit < 0) riskStatus = "Loss";
  else if (budgetUsagePct >= 100) riskStatus = "Over budget";
  else if (budgetUsagePct >= 80) riskStatus = "At risk";
  else riskStatus = "On track";

  return {
    totalBudget,
    totalRevenue,
    totalSpent: actualCost,
    incomeTotal: totalRevenue,
    expenseTotal: actualCost,
    profit,
    marginPct,
    budgetUsagePct,
    remainingBudget,
    riskStatus,
    materialCost: -materialsCost,
    laborCost: -laborCost,
    vendorCost: -vendorCost,
    otherCost: -otherCost,
  };
}

export type ProjectRiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ProjectRiskRow {
  projectId: string;
  projectName: string;
  status: string;
  riskLevel: ProjectRiskLevel;
  triggers: string[];
  budgetVar: number | null;
  laborVar: number | null;
  runwayWeeks: number | null;
  sourceEstimateId?: string;
}

export interface ProjectRiskOverview {
  summary: {
    highCount: number;
    overBudgetCount: number;
    laborOverCount: number;
    lowRunwayCount: number;
  };
  projects: ProjectRiskRow[];
}

/** Computes risk overview from projects + sources + financial. Null-safe, mock-only. */
export function getProjectRiskOverview(): ProjectRiskOverview {
  const projects = getProjects();
  const rows: ProjectRiskRow[] = [];
  let highCount = 0;
  let overBudgetCount = 0;
  let laborOverCount = 0;
  let lowRunwayCount = 0;

  for (const project of projects) {
    const source = getSourceForProject?.(project.id) ?? null;
    const financial = getProjectDetailFinancial(project.id);
    const breakdown = source?.snapshotBudgetBreakdown;
    const snapshotBudgetCost =
      source?.snapshotBudgetCost ??
      (breakdown ? breakdown.materials + breakdown.labor + breakdown.vendor + breakdown.other : undefined);
    const snapshotLaborBudget = source?.snapshotBudgetBreakdown?.labor;
    const actualCost = financial?.totalSpent ?? 0;
    const laborCostAbs = Math.abs(financial?.laborCost ?? 0);
    const budgetVar =
      snapshotBudgetCost != null ? actualCost - snapshotBudgetCost : null;
    const laborVar =
      snapshotLaborBudget != null ? laborCostAbs - snapshotLaborBudget : null;
    const budgetUsagePct =
      snapshotBudgetCost != null && snapshotBudgetCost > 0
        ? actualCost / snapshotBudgetCost
        : null;
    const laborUsagePct =
      snapshotLaborBudget != null && snapshotLaborBudget > 0
        ? laborCostAbs / snapshotLaborBudget
        : null;
    const cashIn = financial?.incomeTotal ?? 0;
    const cashOut = financial?.expenseTotal ?? 0;
    const netCash = cashIn - cashOut;
    const monthlyBurn = cashOut / 3;
    const monthsRemaining =
      monthlyBurn > 0 ? netCash / monthlyBurn : null;
    const runwayWeeks =
      monthsRemaining != null ? monthsRemaining * (52 / 12) : null;

    const triggers: string[] = [];
    if (budgetVar != null && budgetVar > 0) {
      triggers.push("Over budget");
      overBudgetCount++;
    }
    if (laborVar != null && laborVar > 0) {
      triggers.push("Labor over");
      laborOverCount++;
    }
    if (runwayWeeks != null && runwayWeeks < 2) {
      triggers.push("Runway <2w");
      lowRunwayCount++;
    }
    if (budgetUsagePct != null && budgetUsagePct >= 0.8) {
      triggers.push(`Budget ${Math.round(budgetUsagePct * 100)}%`);
    }
    if (laborUsagePct != null && laborUsagePct >= 0.8) {
      triggers.push(`Labor ${Math.round(laborUsagePct * 100)}%`);
    }

    let riskLevel: ProjectRiskLevel = "LOW";
    if (
      (budgetVar != null && budgetVar > 0) ||
      (laborVar != null && laborVar > 0) ||
      (runwayWeeks != null && runwayWeeks < 2)
    ) {
      riskLevel = "HIGH";
      highCount++;
    } else if (
      (budgetUsagePct != null && budgetUsagePct >= 0.8) ||
      (laborUsagePct != null && laborUsagePct >= 0.8) ||
      (runwayWeeks != null && runwayWeeks < 4)
    ) {
      riskLevel = "MEDIUM";
    }

    rows.push({
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      riskLevel,
      triggers,
      budgetVar,
      laborVar,
      runwayWeeks,
      sourceEstimateId: source?.sourceEstimateId,
    });
  }

  const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  rows.sort((a, b) => {
    const r = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    if (r !== 0) return r;
    const aVar = a.budgetVar ?? -Infinity;
    const bVar = b.budgetVar ?? -Infinity;
    return bVar - aVar;
  });

  return {
    summary: {
      highCount,
      overBudgetCount,
      laborOverCount,
      lowRunwayCount,
    },
    projects: rows,
  };
}
