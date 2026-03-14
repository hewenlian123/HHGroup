import { costCodeMaster } from "../mock-data";
import * as estDb from "../estimates-db";
import * as coDb from "../change-orders-db";
import * as projectsDb from "../projects-db";
import * as expensesDb from "../expenses-db";
import * as accountsDb from "../accounts-db";
import * as bankTxDb from "../bank-transactions-db";
import * as invoicesDb from "../invoices-db";
import * as paymentsReceivedDb from "../payments-received-db";
import * as depositsDb from "../deposits-db";
import * as laborDb from "../labor-db";
import * as dailyLaborDb from "../daily-labor-db";
import * as dailyWorkDb from "../daily-work-db";
import * as workerReimbursementsDb from "../worker-reimbursements-db";
import * as workerInvoicesDb from "../worker-invoices-db";
import * as workerPaymentsDb from "../worker-payments-db";
import * as commitmentsDb from "../commitments-db";
import * as refDataDb from "../reference-data-db";
import * as subcontractorsDb from "../subcontractors-db";
import * as subcontractsDb from "../subcontracts-db";
import * as subcontractBillsDb from "../subcontract-bills-db";
import * as subcontractPaymentsDb from "../subcontract-payments-db";
import * as documentsDb from "../documents-db";
import * as projectTasksDb from "../project-tasks-db";
import * as projectScheduleDb from "../project-schedule-db";
import * as activityLogsDb from "../activity-logs-db";
import * as punchListDb from "../punch-list-db";
import * as sitePhotosDb from "../site-photos-db";
import * as inspectionLogDb from "../inspection-log-db";
import * as materialCatalogDb from "../material-catalog-db";
import * as materialSelectionsDb from "../material-selections-db";
import * as projectCloseoutDb from "../project-closeout-db";
import * as commissionDb from "../commission-db";
import * as apBillsDb from "../ap-bills-db";
import { getCanonicalProjectProfit, getCanonicalProjectProfitBatch } from "../profit-engine";
import type { EstimateListItem, EstimateItemRow } from "../estimates-db";
import type { Commitment } from "../commitments-db";
import type { LaborInvoice, LaborPayment, LaborEntry, LaborShiftEntry, LaborInvoiceSplit, LaborInvoiceChecklist, Attachment } from "../labor-db";
import type { Expense, ExpenseLine } from "../expenses-db";
import type { BankTransaction } from "../bank-transactions-db";
import type { Invoice, InvoicePayment, InvoiceStatus, InvoiceLineItem } from "../invoices-db";
import type { InvoiceWithDerived, OverdueInvoiceRow } from "../invoices-db";

export { getProjectCostCodeSummary } from "./forecast";
export type { ProjectCostCodeSummaryItem } from "./forecast";

export type Project = projectsDb.Project;
export type RecentTransaction = {
  id: string;
  type: "invoice" | "bill" | "expense" | "labor";
  description: string;
  amount: number;
  date: string;
  projectName: string;
};
export type ProjectLaborRow = { id: string; projectId: string; worker: string; hours: number; rate: number; totalPaid: number; advance: number; remaining: number; status: "paid" | "pending" };
export type ProjectTransactionRow = { id: string; projectId: string; date: string; type: "expense" | "income"; name: string; amount: number; note: string };
export type { ChangeOrder, ChangeOrderItem, ChangeOrderStatus, ChangeOrderAttachment, CreateChangeOrderInput, UpdateChangeOrderPatch } from "../change-orders-db";
export type ProjectBudgetItem = { id: string; projectId: string; changeOrderId: string; costCode: string; description: string; qty: number; unit: string; unitPrice: number; total: number };
export type { Expense, ExpenseAttachment, ExpenseLine } from "../expenses-db";
export type { Account, AccountType } from "../accounts-db";
export type ExpenseRecord = import("../expenses-db").Expense;
export type { BankTransaction } from "../bank-transactions-db";
export type { Commitment, CommitmentType, CommitmentStatus } from "../commitments-db";
export type { Worker, LaborWorker, LaborEntry, LaborShiftEntry, LaborInvoice, LaborInvoiceSplit, LaborInvoiceChecklist, Attachment, LaborPayment } from "../labor-db";
export { calculateLaborPay } from "../labor-db";
export type { Invoice, InvoicePayment, InvoiceStatus, InvoiceLineItem } from "../invoices-db";
export type { InvoiceWithDerived, OverdueInvoiceRow, InvoiceComputedStatus } from "../invoices-db";
export type { SubcontractorRow, SubcontractorDraft, SubcontractorWithInsuranceAlert } from "../subcontractors-db";
export type { SubcontractRow, SubcontractWithSubcontractor, SubcontractDraft } from "../subcontracts-db";
export type { SubcontractBillRow, SubcontractBillDraft } from "../subcontract-bills-db";
export type { DocumentRow, DocumentWithProject, DocumentFilters, DocumentDraft, DocumentFileType } from "../documents-db";
export type { ProjectTask, ProjectTaskWithWorker, ProjectTaskDraft, ProjectTaskStatus, ProjectTaskPriority } from "../project-tasks-db";
export type { ProjectScheduleItem, ProjectScheduleItemDraft } from "../project-schedule-db";
export type { ActivityLog } from "../activity-logs-db";
export type { PunchListItem, PunchListItemWithJoins, PunchListDraft } from "../punch-list-db";
export type { SitePhoto, SitePhotoWithProject, SitePhotoDraft } from "../site-photos-db";
export type { InspectionLogEntry, InspectionLogEntryWithProject, InspectionLogDraft, InspectionLogStatus } from "../inspection-log-db";
export type { MaterialCatalogRow, MaterialCatalogDraft } from "../material-catalog-db";
export type { ProjectMaterialSelection, ProjectMaterialSelectionWithMaterial, ProjectMaterialSelectionDraft, MaterialSelectionStatus } from "../material-selections-db";
export type {
  CloseoutPunch,
  CloseoutWarranty,
  CloseoutCompletion,
  PunchListItem as CloseoutPunchListItem,
} from "../project-closeout-db";
export type { ProjectCommission, CommissionPaymentRecord, CommissionWithPaid, CommissionStatus, CalculationMode, CommissionRole } from "../commission-db";
export { getCommissionsByProject, getAllCommissionsWithPayments, getCommissionSummary, createCommission, updateCommission, deleteCommission, getCommissionById, getPaymentRecordsByCommissionId, createPaymentRecord } from "../commission-db";
export type { ApBillRow, ApBillWithProject, ApBillPaymentRow, ApBillsFilters, ApBillType, ApBillStatus } from "../ap-bills-db";
export { AP_BILL_TYPES, AP_BILL_STATUSES } from "../ap-bills-db";
export type { DailyWorkEntry, DailyWorkEntryDraft, DayType, PayrollSummaryRow } from "../daily-work-db";
export { dayPayForEntry, totalPayForEntry } from "../daily-work-db";
export type {
  WorkerReimbursement,
  WorkerReimbursementDraft,
  WorkerReimbursementStatus,
  WorkerReimbursementPayment,
  WorkerBalanceRow,
} from "../worker-reimbursements-db";
export type { WorkerInvoice, WorkerInvoiceDraft, WorkerInvoiceStatus } from "../worker-invoices-db";
export type { WorkerPayment, CreateWorkerPaymentInput } from "../worker-payments-db";

export async function getProjects(): Promise<Project[]> {
  return projectsDb.getProjects();
}

export async function getProjectsDashboard(limit?: number) {
  return projectsDb.getProjectsDashboard(limit);
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const p = await projectsDb.getProjectById(id);
  return p ?? undefined;
}

export async function createProject(input: {
  name: string;
  budget: number;
  status?: Project["status"];
  client?: string;
  address?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  estimateRef?: string;
  sourceEstimateId?: string | null;
  snapshotRevenue?: number | null;
  snapshotBudgetCost?: number | null;
  snapshotBreakdown?: { materials: number; labor: number; vendor: number; other: number } | null;
}): Promise<Project> {
  return projectsDb.createProject(input);
}

export async function updateProject(
  id: string,
  patch: import("../projects-db").UpdateProjectPatch
): Promise<Project | null> {
  return projectsDb.updateProject(id, patch);
}

export async function deleteProject(id: string): Promise<boolean> {
  return projectsDb.deleteProject(id);
}

export type ProjectUsageCounts = import("../projects-db").ProjectUsageCounts;

export async function getProjectUsageCounts(projectId: string): Promise<ProjectUsageCounts> {
  return projectsDb.getProjectUsageCounts(projectId);
}

// —— Change Orders (Supabase only) ——

export async function getChangeOrdersByProject(projectId: string) {
  return coDb.getChangeOrdersByProject(projectId);
}

export async function getChangeOrderById(id: string) {
  return coDb.getChangeOrderById(id);
}

export async function getChangeOrderItems(changeOrderId: string) {
  return coDb.getChangeOrderItems(changeOrderId);
}

export async function getProjectBudgetItems(projectId: string): Promise<ProjectBudgetItem[]> {
  const rows = await coDb.getProjectBudgetItems(projectId);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    changeOrderId: r.change_order_id,
    costCode: r.cost_code,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    total: Number(r.total),
  }));
}

export async function createChangeOrder(projectId: string, input?: import("../change-orders-db").CreateChangeOrderInput) {
  return coDb.createChangeOrder(projectId, input);
}

export async function updateChangeOrder(changeOrderId: string, patch: import("../change-orders-db").UpdateChangeOrderPatch) {
  return coDb.updateChangeOrder(changeOrderId, patch);
}

export async function getChangeOrderAttachments(changeOrderId: string) {
  return coDb.getChangeOrderAttachments(changeOrderId);
}

export async function addChangeOrderAttachment(
  changeOrderId: string,
  att: { fileName: string; storagePath: string; mimeType?: string | null; sizeBytes?: number }
) {
  return coDb.addChangeOrderAttachment(changeOrderId, att);
}

export async function deleteChangeOrderAttachment(attachmentId: string) {
  return coDb.deleteChangeOrderAttachment(attachmentId);
}

export async function addChangeOrderItem(
  changeOrderId: string,
  item: { costCode: string; description: string; qty: number; unit: string; unitPrice: number }
) {
  return coDb.addChangeOrderItem(changeOrderId, item);
}

export async function updateChangeOrderItem(
  changeOrderId: string,
  itemId: string,
  patch: { description?: string; qty?: number; unit?: string; unitPrice?: number }
) {
  return coDb.updateChangeOrderItem(changeOrderId, itemId, patch);
}

export async function deleteChangeOrderItem(changeOrderId: string, itemId: string) {
  return coDb.deleteChangeOrderItem(changeOrderId, itemId);
}

export async function updateChangeOrderStatus(
  changeOrderId: string,
  status: import("../change-orders-db").ChangeOrderStatus,
  options?: { approvedBy?: string | null }
): Promise<boolean> {
  return coDb.updateChangeOrderStatus(changeOrderId, status, options);
}

export async function getCommitments(projectId: string): Promise<Commitment[]> {
  return commitmentsDb.getCommitments(projectId);
}

export async function getCommittedCostByCategory(projectId: string): Promise<{ materials: number; labor: number; vendor: number; other: number }> {
  return commitmentsDb.getCommittedCostByCategory(projectId);
}

export async function createCommitment(payload: Omit<Commitment, "id" | "attachments"> & { attachments?: import("../commitments-db").ExpenseAttachment[] }): Promise<Commitment> {
  return commitmentsDb.createCommitment(payload);
}

export async function updateCommitment(
  id: string,
  patch: Partial<Omit<Commitment, "id" | "projectId"> & { attachments: import("../commitments-db").ExpenseAttachment[] }>
): Promise<boolean> {
  return commitmentsDb.updateCommitment(id, patch);
}

export async function deleteCommitment(id: string): Promise<boolean> {
  return commitmentsDb.deleteCommitment(id);
}

export async function getLaborWorkers(): Promise<import("../labor-db").LaborWorker[]> {
  return laborDb.getLaborWorkers();
}

export async function getWorkers(): Promise<import("../labor-db").Worker[]> {
  return laborDb.getWorkers();
}

export async function createWorker(input: {
  name: string;
  phone?: string;
  trade?: string;
  status?: "active" | "inactive";
  halfDayRate?: number;
  dailyRate?: number;
  notes?: string;
}): Promise<import("../labor-db").Worker> {
  return laborDb.createWorker(input);
}

export async function updateWorker(
  id: string,
  patch: Partial<{ name: string; phone?: string; trade?: string; status: "active" | "inactive"; halfDayRate: number; notes?: string }>
): Promise<import("../labor-db").Worker | null> {
  return laborDb.updateWorker(id, patch);
}

export async function getWorkerById(id: string): Promise<import("../labor-db").Worker | null> {
  return laborDb.getWorkerById(id);
}

export async function getWorkerUsage(id: string): Promise<{ used: boolean; reason?: "entries" | "invoices" }> {
  return laborDb.getWorkerUsage(id);
}

export let includeLaborInvoicesInProjectLabor = true;

export function setIncludeLaborInvoicesInProjectLabor(enabled: boolean): void {
  includeLaborInvoicesInProjectLabor = enabled;
}

export function setIncludeLaborInvoicesInLaborActual(enabled: boolean): void {
  includeLaborInvoicesInProjectLabor = enabled;
}

export async function getLaborInvoices(): Promise<LaborInvoice[]> {
  return laborDb.getLaborInvoices();
}

export async function getLaborInvoiceById(id: string): Promise<LaborInvoice | null> {
  return laborDb.getLaborInvoiceById(id);
}

export async function getLaborInvoice(id: string): Promise<LaborInvoice | undefined> {
  const inv = await laborDb.getLaborInvoiceById(id);
  return inv ?? undefined;
}

export async function getLaborInvoicesByWorker(workerId: string): Promise<LaborInvoice[]> {
  return laborDb.getLaborInvoicesByWorker(workerId);
}

export async function createLaborInvoice(input: { workerId: string; invoiceDate?: string; amount?: number; memo?: string }): Promise<LaborInvoice> {
  return laborDb.createLaborInvoice(input);
}

export async function updateLaborInvoice(
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
): Promise<LaborInvoice | null> {
  return laborDb.updateLaborInvoice(id, patch);
}

export async function deleteLaborInvoice(id: string): Promise<void> {
  return laborDb.deleteLaborInvoice(id);
}

export async function addLaborInvoiceAttachment(id: string, attachment: Attachment): Promise<LaborInvoice | null> {
  void attachment; // reserved for future persistence
  return laborDb.getLaborInvoiceById(id);
}

export async function deleteLaborInvoiceAttachment(id: string, attachmentId: string): Promise<LaborInvoice | null> {
  void attachmentId; // reserved for future persistence
  return laborDb.getLaborInvoiceById(id);
}

export async function markLaborInvoiceReviewed(id: string): Promise<LaborInvoice | null> {
  return laborDb.updateLaborInvoice(id, { status: "reviewed" });
}

export async function confirmLaborInvoice(id: string): Promise<LaborInvoice | null> {
  return laborDb.confirmLaborInvoice(id);
}

export async function voidLaborInvoice(id: string): Promise<LaborInvoice | null> {
  return laborDb.voidLaborInvoice(id);
}

export async function getLaborInvoiceActualByProject(projectId: string): Promise<number> {
  return laborDb.getLaborInvoiceActualByProject(projectId);
}

function inDateRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

export async function getConfirmedLaborDailyTotalByWorker(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): Promise<number> {
  const [worker, entries] = await Promise.all([laborDb.getWorkerById(workerId), laborDb.getLaborEntries()]);
  const halfDayRate = worker?.halfDayRate ?? 0;
  const hourlyRate = halfDayRate / 4;
  let total = 0;
  for (const row of entries) {
    if (row.workerId !== workerId) continue;
    if (!inDateRange(row.date, startDate, endDate)) continue;
    if (projectId && row.projectId !== projectId) continue;
    total += (Number(row.hours) || 0) * hourlyRate;
  }
  return total;
}

export async function getConfirmedLaborInvoiceTotalByWorker(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): Promise<number> {
  if (!includeLaborInvoicesInProjectLabor) return 0;
  const invoices = await laborDb.getLaborInvoices();
  let total = 0;
  for (const inv of invoices) {
    if (inv.status !== "confirmed") continue;
    if (inv.workerId !== workerId) continue;
    if (!inDateRange(inv.invoiceDate, startDate, endDate)) continue;
    if (projectId) {
      total += inv.projectSplits.filter((s) => s.projectId === projectId).reduce((sum, s) => sum + s.amount, 0);
    } else {
      total += inv.amount;
    }
  }
  return total;
}

export async function getLaborPayments(workerId?: string, startDate?: string, endDate?: string): Promise<LaborPayment[]> {
  return laborDb.getLaborPayments({ workerId, startDate, endDate });
}

export async function getLaborPaymentsByWorker(workerId: string): Promise<LaborPayment[]> {
  return laborDb.getLaborPayments({ workerId });
}

export async function createLaborPayment(payload: Omit<LaborPayment, "id" | "createdAt">): Promise<LaborPayment> {
  return laborDb.createLaborPayment({
    workerId: payload.workerId,
    paymentDate: payload.paymentDate,
    amount: payload.amount,
    method: payload.method,
    memo: payload.memo,
    appliedRange: payload.appliedRange,
  });
}

export async function deleteLaborPayment(id: string): Promise<boolean> {
  return laborDb.deleteLaborPayment(id);
}

async function getPaymentsTotalForRange(workerId: string, startDate: string, endDate: string): Promise<number> {
  const payments = await laborDb.getLaborPayments({ workerId, startDate, endDate });
  return payments
    .filter((p) => {
      if (p.appliedRange) return p.appliedRange.startDate === startDate && p.appliedRange.endDate === endDate;
      return inDateRange(p.paymentDate, startDate, endDate);
    })
    .reduce((sum, p) => sum + Math.max(0, p.amount), 0);
}

export async function getWorkerPaySummary(workerId: string, startDate: string, endDate: string, projectId?: string) {
  const [confirmedDailyTotal, confirmedInvoiceTotal, paidTotal] = await Promise.all([
    getConfirmedLaborDailyTotalByWorker(workerId, startDate, endDate, projectId),
    getConfirmedLaborInvoiceTotalByWorker(workerId, startDate, endDate, projectId),
    getPaymentsTotalForRange(workerId, startDate, endDate),
  ]);
  const confirmedTotal = confirmedDailyTotal + confirmedInvoiceTotal;
  const balance = Math.max(0, confirmedTotal - paidTotal);
  return { confirmedDailyTotal, confirmedInvoiceTotal, confirmedTotal, paidTotal, balance };
}

export type WorkerEarningAllocationRow = {
  date: string;
  projectId: string;
  projectName: string;
  shift: "AM" | "PM" | "OT";
  amount: number;
  notes: string | null;
};

export async function getWorkerEarningsAllocations(
  workerId: string,
  startDate: string,
  endDate: string,
  projectId?: string
): Promise<WorkerEarningAllocationRow[]> {
  const [projects, worker, entries] = await Promise.all([getProjects(), laborDb.getWorkerById(workerId), laborDb.getLaborEntries()]);
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const getName = (id: string) => projectMap.get(id)?.name ?? id;
  const hourlyRate = (worker?.halfDayRate ?? 0) / 4;
  const out: WorkerEarningAllocationRow[] = [];
  for (const row of entries) {
    if (row.workerId !== workerId) continue;
    if (!inDateRange(row.date, startDate, endDate)) continue;
    if (projectId && row.projectId !== projectId) continue;
    const hours = Number(row.hours) || 0;
    if (hours <= 0 || !row.projectId) continue;
    const amount = hours * hourlyRate;
    out.push({ date: row.date, projectId: row.projectId, projectName: getName(row.projectId), shift: "OT", amount, notes: row.notes || null });
  }
  return out.sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)));
}

export async function getWorkerLaborPayments(workerId: string, startDate: string, endDate: string): Promise<LaborPayment[]> {
  const payments = await laborDb.getLaborPayments({ workerId, startDate, endDate });
  return payments.filter((p) => inDateRange(p.paymentDate, startDate, endDate));
}

export async function getWorkerLaborInvoices(workerId: string, startDate: string, endDate: string): Promise<LaborInvoice[]> {
  const invs = await laborDb.getLaborInvoicesByWorker(workerId);
  return invs.filter((inv) => inDateRange(inv.invoiceDate, startDate, endDate));
}

export async function getLaborPayRunRows(startDate: string, endDate: string, projectId?: string) {
  const workers = await laborDb.getWorkers();
  const result = [];
  for (const worker of workers) {
    const summary = await getWorkerPaySummary(worker.id, startDate, endDate, projectId);
    const payments = await laborDb.getLaborPaymentsByWorker(worker.id);
    const filtered = payments.filter((p) => {
      if (p.appliedRange) return p.appliedRange.startDate === startDate && p.appliedRange.endDate === endDate;
      return inDateRange(p.paymentDate, startDate, endDate);
    });
    result.push({
      workerId: worker.id,
      workerName: worker.name,
      ...summary,
      status: summary.balance > 0 ? "Outstanding" : "Paid",
      payments: filtered,
    });
  }
  return result;
}

export async function disableWorker(id: string): Promise<import("../labor-db").Worker | null> {
  return laborDb.updateWorker(id, { status: "inactive" });
}

export async function deleteWorker(id: string): Promise<void> {
  const usage = await laborDb.getWorkerUsage(id);
  if (usage.used) return;
  return laborDb.deleteWorker(id);
}

export async function getLaborEntriesByDate(date: string): Promise<LaborEntry[]> {
  return laborDb.getLaborEntriesByDate(date);
}

export async function getLaborEntries(status?: "draft" | "confirmed"): Promise<LaborEntry[]> {
  return laborDb.getLaborEntries(status);
}

export async function upsertLaborEntry(entry: Omit<LaborEntry, "id"> & { id?: string }): Promise<LaborEntry> {
  return laborDb.upsertLaborEntry(entry);
}

export async function clearLaborEntry(id: string): Promise<void> {
  return laborDb.deleteLaborEntry(id);
}

export async function getLaborEntriesByProjectAndDate(projectId: string, workDate: string): Promise<LaborEntry[]> {
  return laborDb.getLaborEntriesByProjectAndDate(projectId, workDate);
}

export async function insertDailyLaborEntriesAmPm(
  projectId: string,
  workDate: string,
  rows: import("../labor-db").DailyLaborRowInput[],
  options?: { notes?: string; costCode?: string }
): Promise<LaborEntry[]> {
  return laborDb.insertDailyLaborEntries(projectId, workDate, rows, options);
}

export type { DailyLaborRowInput } from "../labor-db";

export async function confirmLaborEntry(id: string): Promise<LaborEntry | null> {
  return laborDb.confirmLaborEntry(id);
}

export async function unconfirmLaborEntry(id: string): Promise<LaborEntry | null> {
  return laborDb.unconfirmLaborEntry(id);
}

export async function getLaborShiftEntries(date?: string): Promise<LaborShiftEntry[]> {
  if (date) return laborDb.getLaborEntriesByDate(date);
  return laborDb.getLaborEntries();
}

export async function upsertLaborShiftEntry(workerId: string, patch: Omit<LaborShiftEntry, "id" | "workerId">): Promise<LaborShiftEntry> {
  const entries = await laborDb.getLaborEntriesByDate(patch.date);
  const existing = entries.find((r) => r.workerId === workerId);
  return laborDb.upsertLaborEntry({
    id: existing?.id,
    date: patch.date,
    workerId,
    projectId: patch.projectId ?? "",
    hours: patch.hours ?? 0,
    costCode: patch.costCode ?? "",
    notes: patch.notes ?? "",
  });
}

export async function deleteLaborShiftEntry(workerId: string, date: string): Promise<boolean> {
  const entries = await laborDb.getLaborEntriesByDate(date);
  const entry = entries.find((r) => r.workerId === workerId);
  if (!entry) return false;
  await laborDb.deleteLaborEntry(entry.id);
  return true;
}

export async function getLaborAllocatedByProject(projectId: string, date?: string): Promise<number> {
  return laborDb.getLaborAllocatedByProject(projectId, date);
}

export type { DailyLaborEntryRow, DailyLaborEntryDraft, DailyLaborEntryOldForReallocate, LaborEntryWithJoins, LaborEntriesFilters, LaborEntryStatus, ProjectLaborBreakdownRow, MonthlyPayrollRow, WorkerPayableSummary, LaborPaymentInsert, LaborPaymentRow, LaborPaymentInRangeRow } from "../daily-labor-db";
export async function getDailyLaborEntriesByDate(workDate: string) {
  return dailyLaborDb.getDailyLaborEntriesByDate(workDate);
}
export async function getLaborEntriesWithJoins(filters: import("../daily-labor-db").LaborEntriesFilters = {}) {
  return dailyLaborDb.getLaborEntriesWithJoins(filters);
}
export async function getLaborWorkersList() {
  return dailyLaborDb.getLaborWorkersList();
}
export async function getLaborWorkerById(id: string) {
  return dailyLaborDb.getLaborWorkerById(id);
}
export async function getLaborPaymentsByWorkerId(workerId: string) {
  return dailyLaborDb.getLaborPaymentsByWorkerId(workerId);
}
export async function getLaborPaymentsByDateRange(dateFrom: string, dateTo: string) {
  return dailyLaborDb.getLaborPaymentsByDateRange(dateFrom, dateTo);
}
export async function getWorkerPayableSummary(workerId: string) {
  return dailyLaborDb.getWorkerPayableSummary(workerId);
}
export async function insertLaborPayment(payload: import("../daily-labor-db").LaborPaymentInsert) {
  return dailyLaborDb.insertLaborPayment(payload);
}
export async function insertDailyLaborEntries(workDate: string, rows: import("../daily-labor-db").DailyLaborEntryDraft[]) {
  return dailyLaborDb.insertDailyLaborEntries(workDate, rows);
}
export async function updateDailyLaborEntry(
  entryId: string,
  oldValues: import("../daily-labor-db").DailyLaborEntryOldForReallocate,
  draft: import("../daily-labor-db").DailyLaborEntryDraft
) {
  return dailyLaborDb.updateDailyLaborEntry(entryId, oldValues, draft);
}
export async function deleteDailyLaborEntry(entryId: string) {
  return dailyLaborDb.deleteDailyLaborEntry(entryId);
}
export async function submitLaborEntries(entryIds: string[], submittedBy?: string | null) {
  return dailyLaborDb.submitLaborEntries(entryIds, submittedBy);
}
export async function approveLaborEntries(entryIds: string[], approvedBy?: string | null) {
  return dailyLaborDb.approveLaborEntries(entryIds, approvedBy);
}
export async function lockLaborEntries(entryIds: string[], lockedBy?: string | null) {
  return dailyLaborDb.lockLaborEntries(entryIds, lockedBy);
}
export async function getDocuments(filters: import("../documents-db").DocumentFilters = {}) {
  return documentsDb.getDocuments(filters);
}
export async function getDocumentsPaged(input: Parameters<typeof documentsDb.getDocumentsPaged>[0]) {
  return documentsDb.getDocumentsPaged(input);
}
export async function getDocumentsByProject(projectId: string) {
  return documentsDb.getDocumentsByProject(projectId);
}
export async function getDocumentById(id: string) {
  return documentsDb.getDocumentById(id);
}
export async function insertDocument(draft: import("../documents-db").DocumentDraft) {
  return documentsDb.insertDocument(draft);
}
export async function deleteDocument(id: string, removeFromStorage?: boolean) {
  return documentsDb.deleteDocument(id, removeFromStorage ?? true);
}
export async function getDocumentSignedUrl(filePath: string, expiresIn?: number) {
  return documentsDb.getDocumentSignedUrl(filePath, expiresIn);
}
export { DOCUMENT_FILE_TYPES, isPreviewableMime } from "../documents-db";
export async function getAllTasksWithProject() {
  return projectTasksDb.getAllTasksWithProject();
}
export async function getProjectTasks(projectId: string) {
  return projectTasksDb.getProjectTasks(projectId);
}
export async function getProjectTaskById(taskId: string) {
  return projectTasksDb.getProjectTaskById(taskId);
}
export async function createProjectTask(draft: import("../project-tasks-db").ProjectTaskDraft) {
  return projectTasksDb.createProjectTask(draft);
}
export async function updateProjectTask(taskId: string, patch: Parameters<typeof projectTasksDb.updateProjectTask>[1]) {
  return projectTasksDb.updateProjectTask(taskId, patch);
}
export async function deleteProjectTask(taskId: string) {
  return projectTasksDb.deleteProjectTask(taskId);
}
export async function getAllScheduleWithProject() {
  return projectScheduleDb.getAllScheduleWithProject();
}
export async function getProjectSchedule(projectId: string) {
  return projectScheduleDb.getProjectSchedule(projectId);
}
export async function createProjectScheduleItem(draft: import("../project-schedule-db").ProjectScheduleItemDraft) {
  return projectScheduleDb.createProjectScheduleItem(draft);
}
export async function updateProjectScheduleItem(id: string, patch: Parameters<typeof projectScheduleDb.updateProjectScheduleItem>[1]) {
  return projectScheduleDb.updateProjectScheduleItem(id, patch);
}
export async function deleteProjectScheduleItem(id: string) {
  return projectScheduleDb.deleteProjectScheduleItem(id);
}
export async function getActivityLogsByProject(projectId: string, limit?: number) {
  return activityLogsDb.getActivityLogsByProject(projectId, limit);
}
export async function insertActivityLog(projectId: string, type: string, description: string) {
  return activityLogsDb.insertActivityLog(projectId, type, description);
}
export async function getPunchListAll() {
  return punchListDb.getPunchListAll();
}
export async function getPunchListByProject(projectId: string) {
  return punchListDb.getPunchListByProject(projectId);
}
export async function getPunchListSummary() {
  return punchListDb.getPunchListSummary();
}
export async function createPunchListItem(draft: import("../punch-list-db").PunchListDraft) {
  return punchListDb.createPunchListItem(draft);
}
export async function updatePunchListItem(id: string, patch: Parameters<typeof punchListDb.updatePunchListItem>[1]) {
  return punchListDb.updatePunchListItem(id, patch);
}
export async function deletePunchListItem(id: string) {
  return punchListDb.deletePunchListItem(id);
}
export async function getSitePhotos(projectId?: string | null) {
  return sitePhotosDb.getSitePhotos(projectId);
}
export async function getSitePhotoById(id: string) {
  return sitePhotosDb.getSitePhotoById(id);
}
export async function createSitePhoto(draft: import("../site-photos-db").SitePhotoDraft) {
  return sitePhotosDb.createSitePhoto(draft);
}
export async function updateSitePhoto(id: string, patch: Parameters<typeof sitePhotosDb.updateSitePhoto>[1]) {
  return sitePhotosDb.updateSitePhoto(id, patch);
}
export async function deleteSitePhoto(id: string) {
  return sitePhotosDb.deleteSitePhoto(id);
}
export async function getInspectionLogs() {
  return inspectionLogDb.getInspectionLogs();
}
export async function getInspectionLogById(id: string) {
  return inspectionLogDb.getInspectionLogById(id);
}
export async function createInspectionLog(draft: import("../inspection-log-db").InspectionLogDraft) {
  return inspectionLogDb.createInspectionLog(draft);
}
export async function updateInspectionLog(id: string, patch: Parameters<typeof inspectionLogDb.updateInspectionLog>[1]) {
  return inspectionLogDb.updateInspectionLog(id, patch);
}
export async function deleteInspectionLog(id: string) {
  return inspectionLogDb.deleteInspectionLog(id);
}
export async function getMaterialCatalog() {
  return materialCatalogDb.getMaterialCatalog();
}
export async function createMaterial(draft: import("../material-catalog-db").MaterialCatalogDraft) {
  return materialCatalogDb.createMaterial(draft);
}
export async function updateMaterial(id: string, patch: Parameters<typeof materialCatalogDb.updateMaterial>[1]) {
  return materialCatalogDb.updateMaterial(id, patch);
}
export async function getSelectionsByProject(projectId: string) {
  return materialSelectionsDb.getSelectionsByProject(projectId);
}
export async function createMaterialSelection(draft: import("../material-selections-db").ProjectMaterialSelectionDraft) {
  return materialSelectionsDb.createSelection(draft);
}
export async function updateMaterialSelection(id: string, patch: Parameters<typeof materialSelectionsDb.updateSelection>[1]) {
  return materialSelectionsDb.updateSelection(id, patch);
}
export async function deleteMaterialSelection(id: string) {
  return materialSelectionsDb.deleteSelection(id);
}
export async function getCloseoutPunch(projectId: string) {
  return projectCloseoutDb.getCloseoutPunch(projectId);
}
export async function upsertCloseoutPunch(projectId: string, data: Parameters<typeof projectCloseoutDb.upsertCloseoutPunch>[1]) {
  return projectCloseoutDb.upsertCloseoutPunch(projectId, data);
}
export async function getCloseoutWarranty(projectId: string) {
  return projectCloseoutDb.getCloseoutWarranty(projectId);
}
export async function upsertCloseoutWarranty(projectId: string, data: Parameters<typeof projectCloseoutDb.upsertCloseoutWarranty>[1]) {
  return projectCloseoutDb.upsertCloseoutWarranty(projectId, data);
}
export async function getCloseoutCompletion(projectId: string) {
  return projectCloseoutDb.getCloseoutCompletion(projectId);
}
export async function upsertCloseoutCompletion(projectId: string, data: Parameters<typeof projectCloseoutDb.upsertCloseoutCompletion>[1]) {
  return projectCloseoutDb.upsertCloseoutCompletion(projectId, data);
}
export async function getApBills(filters: import("../ap-bills-db").ApBillsFilters = {}) {
  return apBillsDb.getApBills(filters);
}
export async function getApBillById(id: string) {
  return apBillsDb.getApBillById(id);
}
export async function getApBillPayments(billId: string) {
  return apBillsDb.getApBillPayments(billId);
}
export async function createApBill(draft: Parameters<typeof apBillsDb.createApBill>[0]) {
  return apBillsDb.createApBill(draft);
}
export async function updateApBill(id: string, patch: Parameters<typeof apBillsDb.updateApBill>[1]) {
  return apBillsDb.updateApBill(id, patch);
}
export async function addApBillPayment(billId: string, payment: Parameters<typeof apBillsDb.addApBillPayment>[1]) {
  return apBillsDb.addApBillPayment(billId, payment);
}
export async function setApBillPending(id: string) {
  return apBillsDb.setApBillPending(id);
}
export async function voidApBill(id: string) {
  return apBillsDb.voidApBill(id);
}
export async function deleteApBillDraft(id: string) {
  return apBillsDb.deleteApBillDraft(id);
}
export async function getApBillsSummary() {
  return apBillsDb.getApBillsSummary();
}

/** Finance overview: Revenue (invoices.total), Total Bills (ap_bills.amount), Total Expenses (expense_lines), Total Labor Cost (labor_entries.cost_amount), Profit = Revenue - Bills - Expenses - Labor. */
export async function getFinanceOverviewStats(): Promise<{
  revenue: number;
  totalBills: number;
  totalExpenses: number;
  totalLaborCost: number;
  profit: number;
}> {
  const [revenueCollected, totalBills, totalExpenses, totalLaborCost] = await Promise.all([
    invoicesDb.getCompanyRevenueAndCollected().catch(() => ({ revenue: 0, collected: 0 })),
    apBillsDb.getTotalBillsAmount().catch(() => 0),
    expensesDb.getTotalExpenseLinesSum().catch(() => 0),
    dailyLaborDb.getTotalLaborCost().catch(() => 0),
  ]);
  const revenue = revenueCollected.revenue ?? 0;
  const profit = revenue - totalBills - totalExpenses - totalLaborCost;
  return { revenue, totalBills, totalExpenses, totalLaborCost, profit };
}

/** Labor cost (Approved/Locked only) for work_date in the current week (Sun–Sat). For dashboard. */
export async function getLaborCostThisWeek(): Promise<number> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  return laborDb.getLaborCostForDateRange(
    startOfWeek.toISOString().slice(0, 10),
    endOfWeek.toISOString().slice(0, 10)
  );
}
/** Sum of expense line amounts for expenses dated in the current month. For dashboard. */
export async function getExpensesThisMonth(): Promise<number> {
  const now = new Date();
  return expensesDb.getExpensesTotalForMonth(now.getFullYear(), now.getMonth() + 1);
}
export async function getApBillsByProject(projectId: string) {
  return apBillsDb.getApBillsByProject(projectId);
}
export async function getProjectLaborBreakdown(projectId: string) {
  return dailyLaborDb.getProjectLaborBreakdown(projectId);
}
export async function getMonthlyPayrollSummary(year: number, month: number) {
  return dailyLaborDb.getMonthlyPayrollSummary(year, month);
}
export async function getTotalLaborCost(): Promise<number> {
  return dailyLaborDb.getTotalLaborCost();
}

// Construction daily work (daily_work_entries)
export async function getDailyWorkEntriesByDate(date: string) {
  return dailyWorkDb.getDailyWorkEntriesByDate(date);
}
export async function getDailyWorkEntriesByDateAndProject(date: string, projectId: string | null) {
  return dailyWorkDb.getDailyWorkEntriesByDateAndProject(date, projectId);
}
export async function getDailyWorkEntriesInRange(fromDate: string, toDate: string) {
  return dailyWorkDb.getDailyWorkEntriesInRange(fromDate, toDate);
}
export async function insertDailyWorkEntry(workDate: string, draft: import("../daily-work-db").DailyWorkEntryDraft) {
  return dailyWorkDb.insertDailyWorkEntry(workDate, draft);
}
export async function updateDailyWorkEntry(id: string, draft: Partial<import("../daily-work-db").DailyWorkEntryDraft>) {
  return dailyWorkDb.updateDailyWorkEntry(id, draft);
}
export async function deleteDailyWorkEntry(id: string) {
  return dailyWorkDb.deleteDailyWorkEntry(id);
}
export async function getPayrollSummary(fromDate: string, toDate: string) {
  return dailyWorkDb.getPayrollSummary(fromDate, toDate);
}
export async function getDailyWorkEntriesForWorker(workerId: string, fromDate: string, toDate: string) {
  return dailyWorkDb.getDailyWorkEntriesForWorker(workerId, fromDate, toDate);
}

// Worker reimbursements
export async function getWorkerReimbursements() {
  return workerReimbursementsDb.getWorkerReimbursements();
}
export async function getWorkerReimbursementsByWorkerId(workerId: string) {
  return workerReimbursementsDb.getWorkerReimbursementsByWorkerId(workerId);
}
export async function insertWorkerReimbursement(draft: import("../worker-reimbursements-db").WorkerReimbursementDraft) {
  return workerReimbursementsDb.insertWorkerReimbursement(draft);
}
export async function updateWorkerReimbursement(id: string, draft: Partial<import("../worker-reimbursements-db").WorkerReimbursementDraft>) {
  return workerReimbursementsDb.updateWorkerReimbursement(id, draft);
}
export async function approveWorkerReimbursement(id: string) {
  return workerReimbursementsDb.approveWorkerReimbursement(id);
}
export async function deleteWorkerReimbursement(id: string) {
  return workerReimbursementsDb.deleteWorkerReimbursement(id);
}
export async function getWorkerReimbursementPayments(workerId: string) {
  return workerReimbursementsDb.getWorkerReimbursementPayments(workerId);
}
export async function getWorkerReimbursementBalances() {
  return workerReimbursementsDb.getWorkerReimbursementBalances();
}
export async function markReimbursementPaid(reimbursementId: string) {
  return workerReimbursementsDb.markReimbursementPaid(reimbursementId);
}
export async function markWorkerReimbursementsPaid(workerId: string, projectId?: string | null) {
  return workerReimbursementsDb.markWorkerReimbursementsPaid(workerId, projectId);
}

// Worker invoices (1099)
export async function getWorkerInvoices() {
  return workerInvoicesDb.getWorkerInvoices();
}
export async function getWorkerInvoiceById(id: string) {
  return workerInvoicesDb.getWorkerInvoiceById(id);
}
export async function insertWorkerInvoice(draft: import("../worker-invoices-db").WorkerInvoiceDraft) {
  return workerInvoicesDb.insertWorkerInvoice(draft);
}
export async function updateWorkerInvoice(id: string, draft: Partial<import("../worker-invoices-db").WorkerInvoiceDraft>) {
  return workerInvoicesDb.updateWorkerInvoice(id, draft);
}
export async function deleteWorkerInvoice(id: string) {
  return workerInvoicesDb.deleteWorkerInvoice(id);
}
export async function markWorkerInvoicesPaid(workerId: string, projectId?: string | null) {
  return workerInvoicesDb.markWorkerInvoicesPaid(workerId, projectId);
}

// Worker payments
export async function createWorkerPayment(input: import("../worker-payments-db").CreateWorkerPaymentInput) {
  return workerPaymentsDb.createWorkerPayment(input);
}
export async function getWorkerPayments(filters?: Parameters<typeof workerPaymentsDb.getWorkerPayments>[0]) {
  return workerPaymentsDb.getWorkerPayments(filters);
}
export async function getWorkerPaymentById(id: string) {
  return workerPaymentsDb.getWorkerPaymentById(id);
}
export async function deleteWorkerPayment(id: string) {
  return workerPaymentsDb.deleteWorkerPayment(id);
}

export async function getLaborActualByProject(projectId: string): Promise<number> {
  const [fromEntries, fromInvoices] = await Promise.all([
    laborDb.getLaborAllocatedByProject(projectId),
    includeLaborInvoicesInProjectLabor ? laborDb.getLaborInvoiceActualByProject(projectId) : 0,
  ]);
  return fromEntries + fromInvoices;
}

export async function getDashboardStats() {
  const projects = await projectsDb.getProjectsDashboard(200);
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  // Use batch function: 5 queries total regardless of project count (vs 5×N previously).
  const profitMap = await getCanonicalProjectProfitBatch(projects.map((p) => p.id)).catch(() => new Map());
  const totalSpent = projects.reduce((s, p) => s + (profitMap.get(p.id)?.actualCost ?? 0), 0);
  const totalProfit = projects.reduce((s, p) => s + (profitMap.get(p.id)?.profit ?? 0), 0);
  return { totalProjects, activeProjects, totalBudget, totalSpent, totalProfit };
}

export async function getRecentTransactions(limit = 20): Promise<RecentTransaction[]> {
  const cap = Math.max(1, Math.min(limit, 100));
  const [invoices, bills, expenses, labor] = await Promise.all([
    invoicesDb.getInvoicesRecent(cap).catch(() => []),
    apBillsDb.getApBillsRecent(cap).catch(() => []),
    expensesDb.getExpensesRecent(cap).catch(() => []),
    dailyLaborDb.getLaborEntriesRecent(cap).catch(() => []),
  ]);
  type Row = { id: string; created_at: string; amount: number; description: string; projectName: string | null };
  const invoiceRows: Row[] = invoices.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    amount: r.total,
    description: [r.invoice_no, r.client_name].filter(Boolean).join(" · ") || "Invoice",
    projectName: r.project_name,
  }));
  const billRows: Row[] = bills.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    amount: r.amount,
    description: [r.bill_no, r.vendor_name].filter(Boolean).join(" · ") || "Bill",
    projectName: r.project_name ?? null,
  }));
  const expenseRows: Row[] = expenses.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    amount: r.total,
    description: r.vendor_name?.trim() || r.notes?.slice(0, 50) || "Expense",
    projectName: r.project_name,
  }));
  const laborRows: Row[] = labor.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    amount: r.cost_amount,
    description: r.notes?.slice(0, 50) || `Labor · ${r.work_date}`,
    projectName: r.project_name,
  }));
  const withType: Array<{ id: string; type: RecentTransaction["type"]; created_at: string; amount: number; description: string; projectName: string }> = [
    ...invoiceRows.map((r) => ({ ...r, type: "invoice" as const, projectName: r.projectName ?? "" })),
    ...billRows.map((r) => ({ ...r, type: "bill" as const, projectName: r.projectName ?? "" })),
    ...expenseRows.map((r) => ({ ...r, type: "expense" as const, projectName: r.projectName ?? "" })),
    ...laborRows.map((r) => ({ ...r, type: "labor" as const, projectName: r.projectName ?? "" })),
  ];
  const sorted = withType.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return sorted.slice(0, limit).map((t) => ({
    id: t.id,
    type: t.type,
    description: t.description,
    amount: t.type === "invoice" ? t.amount : -t.amount,
    date: (t.created_at || "").slice(0, 10),
    projectName: t.projectName || "—",
  }));
}

export async function getExpenseCategories(includeDisabled = false): Promise<string[]> {
  return refDataDb.getExpenseCategories(includeDisabled);
}

export async function addExpenseCategory(name: string): Promise<string> {
  return refDataDb.addExpenseCategory(name);
}

export async function getCategoryUsageCount(name: string): Promise<number> {
  return refDataDb.getCategoryUsageCount(name);
}

export async function renameExpenseCategory(oldName: string, newName: string): Promise<boolean> {
  return refDataDb.renameExpenseCategory(oldName, newName);
}

export async function disableExpenseCategory(name: string): Promise<boolean> {
  return refDataDb.disableExpenseCategory(name);
}

export async function enableExpenseCategory(name: string): Promise<boolean> {
  return refDataDb.enableExpenseCategory(name);
}

export async function deleteExpenseCategory(name: string): Promise<boolean> {
  return refDataDb.deleteExpenseCategory(name);
}

export async function isExpenseCategoryDisabled(name: string): Promise<boolean> {
  return refDataDb.isExpenseCategoryDisabled(name);
}

export async function getVendors(includeDisabled = false): Promise<string[]> {
  return refDataDb.getVendors(includeDisabled);
}

export async function addVendor(name: string): Promise<string> {
  return refDataDb.addVendor(name);
}

export async function getVendorUsageCount(name: string): Promise<number> {
  return refDataDb.getVendorUsageCount(name);
}

export async function renameVendor(oldName: string, newName: string): Promise<boolean> {
  return refDataDb.renameVendor(oldName, newName);
}

export async function disableVendor(name: string): Promise<boolean> {
  return refDataDb.disableVendor(name);
}

export async function enableVendor(name: string): Promise<boolean> {
  return refDataDb.enableVendor(name);
}

export async function deleteVendor(name: string): Promise<boolean> {
  return refDataDb.deleteVendor(name);
}

export async function isVendorDisabled(name: string): Promise<boolean> {
  return refDataDb.isVendorDisabled(name);
}

export async function getSubcontractors(): Promise<import("../subcontractors-db").SubcontractorRow[]> {
  return subcontractorsDb.getSubcontractors();
}

export async function getSubcontractorsWithInsuranceAlerts(): Promise<import("../subcontractors-db").SubcontractorWithInsuranceAlert[]> {
  return subcontractorsDb.getSubcontractorsWithInsuranceAlerts();
}

export async function getSubcontractorById(id: string): Promise<import("../subcontractors-db").SubcontractorRow | null> {
  return subcontractorsDb.getSubcontractorById(id);
}

export async function insertSubcontractor(draft: import("../subcontractors-db").SubcontractorDraft): Promise<void> {
  return subcontractorsDb.insertSubcontractor(draft);
}

export async function updateSubcontractor(
  id: string,
  patch: import("../subcontractors-db").UpdateSubcontractorPatch
): Promise<import("../subcontractors-db").SubcontractorRow | null> {
  return subcontractorsDb.updateSubcontractor(id, patch);
}

export async function deleteSubcontractor(id: string): Promise<void> {
  return subcontractorsDb.deleteSubcontractor(id);
}

export async function getSubcontractsByProject(projectId: string): Promise<import("../subcontracts-db").SubcontractWithSubcontractor[]> {
  return subcontractsDb.getSubcontractsByProject(projectId);
}

export async function getSubcontractsSummaryAll(): Promise<{ id: string; subcontractor_id: string; contract_amount: number }[]> {
  return subcontractsDb.getSubcontractsSummaryAll();
}

export async function getSubcontractsWithDetailsAll(): Promise<
  { id: string; subcontractor_id: string; project_id: string; subcontractor_name: string; project_name: string }[]
> {
  return subcontractsDb.getSubcontractsWithDetailsAll();
}

export async function insertSubcontract(draft: import("../subcontracts-db").SubcontractDraft): Promise<void> {
  return subcontractsDb.insertSubcontract(draft);
}

export async function getSubcontractById(subcontractId: string): Promise<import("../subcontracts-db").SubcontractWithSubcontractor | null> {
  return subcontractsDb.getSubcontractById(subcontractId);
}

export async function updateSubcontractStatus(subcontractId: string, status: import("../subcontracts-db").SubcontractRow["status"]): Promise<void> {
  return subcontractsDb.updateSubcontractStatus(subcontractId, status);
}

export async function getSubcontractsBySubcontractor(subcontractorId: string): Promise<import("../subcontracts-db").SubcontractWithProject[]> {
  return subcontractsDb.getSubcontractsBySubcontractor(subcontractorId);
}

export async function getBillsBySubcontract(subcontractId: string): Promise<import("../subcontract-bills-db").SubcontractBillRow[]> {
  return subcontractBillsDb.getBillsBySubcontract(subcontractId);
}

export async function insertSubcontractBill(draft: import("../subcontract-bills-db").SubcontractBillDraft): Promise<void> {
  return subcontractBillsDb.insertSubcontractBill(draft);
}

export async function approveSubcontractBill(billId: string): Promise<void> {
  return subcontractBillsDb.approveSubcontractBill(billId);
}

export async function voidSubcontractBill(billId: string): Promise<void> {
  return subcontractBillsDb.voidSubcontractBill(billId);
}

export async function updateSubcontractBill(
  billId: string,
  patch: Parameters<typeof subcontractBillsDb.updateSubcontractBill>[1]
): Promise<void> {
  return subcontractBillsDb.updateSubcontractBill(billId, patch);
}

export async function deleteSubcontractBillDraft(billId: string): Promise<void> {
  return subcontractBillsDb.deleteSubcontractBillDraft(billId);
}

export async function getBillsSummaryAll(): Promise<{ subcontract_id: string; amount: number; status: string }[]> {
  return subcontractBillsDb.getBillsSummaryAll();
}

export async function getBillsAll(): Promise<{ id: string; amount: number; status: string }[]> {
  return subcontractBillsDb.getBillsAll();
}

export async function getApprovedSubcontractBillsTotalByProject(projectId: string): Promise<number> {
  return subcontractBillsDb.getApprovedSubcontractBillsTotalByProject(projectId);
}

export async function getBillsBySubcontractIds(subcontractIds: string[]): Promise<import("../subcontract-bills-db").SubcontractBillRow[]> {
  return subcontractBillsDb.getBillsBySubcontractIds(subcontractIds);
}

export async function getPaymentsSummaryAll(): Promise<{ subcontract_id: string; amount: number }[]> {
  return subcontractPaymentsDb.getPaymentsSummaryAll();
}

export async function getSubcontractPaymentsAll(): Promise<{ bill_id: string | null; amount: number }[]> {
  return subcontractPaymentsDb.getPaymentsAll();
}

export async function getPaymentsBySubcontractIds(subcontractIds: string[]): Promise<import("../subcontract-payments-db").SubcontractPaymentRow[]> {
  return subcontractPaymentsDb.getPaymentsBySubcontractIds(subcontractIds);
}

export async function recordSubcontractPayment(input: Parameters<typeof subcontractPaymentsDb.recordSubcontractPayment>[0]): Promise<void> {
  return subcontractPaymentsDb.recordSubcontractPayment(input);
}

export async function getPaymentMethods(includeDisabled = false): Promise<string[]> {
  return refDataDb.getPaymentMethods(includeDisabled);
}

export async function addPaymentMethod(name: string): Promise<string> {
  return refDataDb.addPaymentMethod(name);
}

export async function getPaymentMethodUsageCount(name: string): Promise<number> {
  return refDataDb.getPaymentMethodUsageCount(name);
}

export async function renamePaymentMethod(oldName: string, newName: string): Promise<boolean> {
  return refDataDb.renamePaymentMethod(oldName, newName);
}

export async function disablePaymentMethod(name: string): Promise<boolean> {
  return refDataDb.disablePaymentMethod(name);
}

export async function enablePaymentMethod(name: string): Promise<boolean> {
  return refDataDb.enablePaymentMethod(name);
}

export async function deletePaymentMethod(name: string): Promise<boolean> {
  return refDataDb.deletePaymentMethod(name);
}

export async function isPaymentMethodDisabled(name: string): Promise<boolean> {
  return refDataDb.isPaymentMethodDisabled(name);
}

export async function getExpenses(): Promise<Expense[]> {
  return expensesDb.getExpenses();
}

export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  return expensesDb.getExpenseById(expenseId);
}

export async function getExpenseCardNames(paymentMethod: string): Promise<string[]> {
  return expensesDb.getExpenseCardNames(paymentMethod);
}

export async function getAccounts(): Promise<import("../accounts-db").Account[]> {
  return accountsDb.getAccounts();
}

export async function createAccount(input: Parameters<typeof accountsDb.createAccount>[0]): Promise<import("../accounts-db").Account> {
  return accountsDb.createAccount(input);
}

export async function updateAccount(id: string, patch: Parameters<typeof accountsDb.updateAccount>[1]): Promise<import("../accounts-db").Account | null> {
  return accountsDb.updateAccount(id, patch);
}

export async function deleteAccount(id: string): Promise<boolean> {
  return accountsDb.deleteAccount(id);
}

export function getExpenseTotal(expense: Expense): number {
  return expensesDb.getExpenseTotal(expense);
}

export async function createExpense(payload: Partial<Omit<Expense, "id" | "attachments" | "lines">> & { attachments?: import("../expenses-db").ExpenseAttachment[]; lines?: Array<Omit<ExpenseLine, "id">> }): Promise<Expense> {
  const lines = payload.lines?.length
    ? payload.lines.map((l) => ({
        projectId: l.projectId ?? null,
        category: l.category ?? "Other",
        costCode: l.costCode ?? null,
        memo: l.memo ?? null,
        amount: l.amount ?? 0,
      }))
    : undefined;
  let paymentMethod = payload.paymentMethod ?? "Card";
  if (payload.accountId) {
    const accounts = await accountsDb.getAccounts();
    const acc = accounts.find((a) => a.id === payload.accountId);
    if (acc) paymentMethod = acc.name;
  }
  return expensesDb.createExpense({
    date: payload.date ?? new Date().toISOString().slice(0, 10),
    vendorName: payload.vendorName ?? "",
    paymentMethod,
    referenceNo: payload.referenceNo,
    notes: payload.notes,
    cardName: payload.cardName ?? undefined,
    accountId: payload.accountId ?? undefined,
    lines: lines ?? [{ projectId: null, category: "Other", amount: 0 }],
    linkedBankTxId: payload.linkedBankTxId,
  });
}

export async function createQuickExpense(payload: {
  date: string;
  vendorName: string;
  totalAmount: number;
  receiptUrl: string;
}): Promise<Expense> {
  return expensesDb.createQuickExpense(payload);
}

export async function updateExpense(expenseId: string, patch: Partial<Omit<Expense, "id" | "lines" | "attachments">>): Promise<Expense | null> {
  let resolvedPatch = { ...patch };
  if (patch.accountId !== undefined) {
    const accounts = await accountsDb.getAccounts();
    const acc = accounts.find((a) => a.id === patch.accountId);
    if (acc) resolvedPatch = { ...resolvedPatch, paymentMethod: acc.name };
  }
  return expensesDb.updateExpense(expenseId, {
    date: resolvedPatch.date,
    vendorName: resolvedPatch.vendorName,
    paymentMethod: resolvedPatch.paymentMethod,
    referenceNo: resolvedPatch.referenceNo,
    notes: resolvedPatch.notes,
    cardName: resolvedPatch.cardName,
    accountId: resolvedPatch.accountId,
  });
}

export async function updateExpenseReceiptUrl(expenseId: string, receiptUrl: string): Promise<Expense | null> {
  return expensesDb.updateExpenseReceiptUrl(expenseId, receiptUrl);
}

export async function updateExpenseStatus(
  expenseId: string,
  status: "pending" | "needs_review" | "approved" | "reimbursed"
): Promise<Expense | null> {
  return expensesDb.updateExpenseStatus(expenseId, status);
}

export async function updateExpenseForReview(
  expenseId: string,
  patch: Partial<{
    vendorName: string;
    notes: string;
    status: "pending" | "needs_review" | "approved" | "reimbursed";
    workerId: string | null;
    projectId: string | null;
    category: string;
    amount: number;
  }>
): Promise<Expense | null> {
  return expensesDb.updateExpenseForReview(expenseId, patch);
}

export async function markWorkerExpensesReimbursed(workerId: string): Promise<number> {
  return expensesDb.markWorkerExpensesReimbursed(workerId);
}

export async function addExpenseLine(expenseId: string, line: Partial<Omit<import("../expenses-db").ExpenseLine, "id">>): Promise<Expense | null> {
  return expensesDb.addExpenseLine(expenseId, {
    projectId: line.projectId ?? null,
    category: line.category ?? "Other",
    costCode: line.costCode ?? null,
    memo: line.memo ?? null,
    amount: line.amount ?? 0,
  });
}

export async function updateExpenseLine(expenseId: string, lineId: string, patch: Partial<import("../expenses-db").ExpenseLine>): Promise<Expense | null> {
  return expensesDb.updateExpenseLine(expenseId, lineId, patch);
}

export async function deleteExpenseLine(expenseId: string, lineId: string): Promise<Expense | null> {
  return expensesDb.deleteExpenseLine(expenseId, lineId);
}

export async function deleteExpense(expenseId: string): Promise<boolean> {
  return expensesDb.deleteExpense(expenseId);
}

export async function addExpenseAttachment(expenseId: string, attachment: import("../expenses-db").ExpenseAttachment): Promise<Expense | null> {
  return expensesDb.addExpenseAttachment(expenseId, attachment);
}

export async function deleteExpenseAttachment(expenseId: string, attachmentId: string): Promise<Expense | null> {
  return expensesDb.deleteExpenseAttachment(expenseId, attachmentId);
}

export async function getExpenseTotalsByProject(projectId: string): Promise<number> {
  return expensesDb.getExpenseTotalsByProject(projectId);
}

export async function getTotalExpenses(): Promise<number> {
  return expensesDb.getTotalExpenses();
}

export async function getExpenseLinesByProject(projectId: string, limit = 5): Promise<Array<{ expenseId: string; date: string; vendorName: string; line: import("../expenses-db").ExpenseLine }>> {
  return expensesDb.getExpenseLinesByProject(projectId, limit);
}

export async function getProjectExpenseLines(projectId: string): Promise<Array<{ expenseId: string; date: string; vendorName: string; line: import("../expenses-db").ExpenseLine }>> {
  return expensesDb.getProjectExpenseLines(projectId);
}

/** Map expense line category to drilldown bucket (Materials/Labor/Vendor/Other). */
function categoryToDrilldownBucket(category: string): "Materials" | "Labor" | "Vendor" | "Other" {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "materials") return "Materials";
  if (c === "labor") return "Labor";
  if (c === "subcontractor") return "Vendor";
  return "Other";
}

/** Category spend by project (Materials/Labor/Vendor/Other). */
export async function getCategorySpendByProject(projectId: string): Promise<{ materials: number; labor: number; vendor: number; other: number }> {
  const out = { materials: 0, labor: 0, vendor: 0, other: 0 };
  const keyMap: Record<"Materials" | "Labor" | "Vendor" | "Other", keyof typeof out> = {
    Materials: "materials",
    Labor: "labor",
    Vendor: "vendor",
    Other: "other",
  };
  const lines = await expensesDb.getProjectExpenseLines(projectId);
  for (const { line } of lines) {
    const bucket = categoryToDrilldownBucket(line.category ?? "Other");
    out[keyMap[bucket]] += line.amount ?? 0;
  }
  return out;
}

export interface VendorSpendRow {
  vendorName: string;
  total: number;
  txCount: number;
  lastDate: string;
}

export async function getVendorSpendByProject(projectId: string): Promise<VendorSpendRow[]> {
  const byVendor: Record<string, { total: number; count: number; lastDate: string }> = {};
  const lines = await expensesDb.getProjectExpenseLines(projectId);
  for (const { vendorName, date, line } of lines) {
    const v = vendorName?.trim() || "—";
    if (!byVendor[v]) byVendor[v] = { total: 0, count: 0, lastDate: date };
    byVendor[v].total += line.amount ?? 0;
    byVendor[v].count += 1;
    if (date > byVendor[v].lastDate) byVendor[v].lastDate = date;
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

export async function getProjectCashFlowData(projectId: string): Promise<ProjectCashFlowData> {
  const projectTxs = await getProjectTransactions(projectId);
  const lines = await expensesDb.getProjectExpenseLines(projectId);
  const incomeByDate: Record<string, number> = {};
  const expenseByDate: Record<string, number> = {};
  for (const tx of projectTxs) {
    if (tx.type === "income" && tx.amount > 0) {
      incomeByDate[tx.date] = (incomeByDate[tx.date] ?? 0) + tx.amount;
    }
  }
  for (const { date, line } of lines) {
    const amt = line.amount ?? 0;
    expenseByDate[date] = (expenseByDate[date] ?? 0) + amt;
  }
  const dates = Array.from(new Set([...Object.keys(incomeByDate), ...Object.keys(expenseByDate)])).sort();
  let cumIncome = 0;
  let cumExpense = 0;
  const points: ProjectCashFlowPoint[] = [];
  for (const date of dates) {
    cumIncome += incomeByDate[date] ?? 0;
    cumExpense += expenseByDate[date] ?? 0;
    points.push({ date, cumulativeIncome: cumIncome, cumulativeExpense: cumExpense, netCash: cumIncome - cumExpense });
  }
  return { points, totalIncome: cumIncome, totalExpense: cumExpense, netPosition: cumIncome - cumExpense };
}

export async function getBankTransactions(): Promise<BankTransaction[]> {
  return bankTxDb.getBankTransactions();
}

export interface CashOverview {
  bankBalance: number;
  systemExpenses: number;
  reconciledBankTotal: number;
  unreconciledBankTotal: number;
  cashDifference: number;
  recentUnreconciled: BankTransaction[];
}

export async function getCashOverview(): Promise<CashOverview> {
  const [txs, systemExpenses] = await Promise.all([bankTxDb.getBankTransactions(), expensesDb.getTotalExpenses()]);
  const bankBalance = txs.reduce((s, t) => s + t.amount, 0);
  const reconciledBankTotal = txs.filter((t) => t.status === "reconciled").reduce((s, t) => s + t.amount, 0);
  const unreconciledBankTotal = txs.filter((t) => t.status === "unmatched").reduce((s, t) => s + t.amount, 0);
  const recentUnreconciled = txs.filter((t) => t.status === "unmatched").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return {
    bankBalance,
    systemExpenses,
    reconciledBankTotal,
    unreconciledBankTotal,
    cashDifference: bankBalance - systemExpenses,
    recentUnreconciled,
  };
}

export type ProjectFromEstimate = {
  projectId: string;
  sourceEstimateId: string;
  sourceSnapshotId: string;
  sourceVersion: number;
  snapshotRevenue?: number;
  snapshotBudgetCost?: number;
  snapshotBudgetBreakdown?: { materials: number; labor: number; vendor: number; other: number };
};

export async function getInvoices(): Promise<Invoice[]> {
  return invoicesDb.getInvoices();
}

export async function getInvoicePayments(): Promise<InvoicePayment[]> {
  return invoicesDb.getInvoicePayments();
}

export async function getInvoicesWithDerived(filters?: { status?: InvoiceStatus | "Overdue"; projectId?: string; search?: string }): Promise<InvoiceWithDerived[]> {
  return invoicesDb.getInvoicesWithDerived(filters);
}

export async function getInvoicesWithDerivedPaged(input?: Parameters<typeof invoicesDb.getInvoicesWithDerivedPaged>[0]) {
  return invoicesDb.getInvoicesWithDerivedPaged(input);
}

export async function getOverdueInvoices(): Promise<OverdueInvoiceRow[]> {
  return invoicesDb.getOverdueInvoices();
}

export async function getInvoiceById(id: string): Promise<InvoiceWithDerived | null> {
  return invoicesDb.getInvoiceByIdWithDerived(id);
}

/** Alias for getInvoiceById for compatibility. */
export const getInvoiceByIdWithDerived = getInvoiceById;

export async function getPaymentsByInvoiceId(invoiceId: string): Promise<InvoicePayment[]> {
  return invoicesDb.getPaymentsByInvoiceId(invoiceId);
}

export async function recordInvoicePayment(invoiceId: string, payload: { date: string; amount: number; method: string; memo?: string }): Promise<InvoicePayment | null> {
  return invoicesDb.recordInvoicePayment(invoiceId, payload);
}

export async function deleteInvoicePayment(paymentId: string): Promise<boolean> {
  return invoicesDb.deleteInvoicePayment(paymentId);
}

export async function voidInvoice(invoiceId: string): Promise<boolean> {
  return invoicesDb.voidInvoice(invoiceId);
}
export async function revertInvoiceToDraft(invoiceId: string): Promise<boolean> {
  return invoicesDb.revertInvoiceToDraft(invoiceId);
}

export async function deleteInvoice(invoiceId: string): Promise<boolean> {
  return invoicesDb.deleteInvoice(invoiceId);
}

export async function createInvoice(payload: {
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  taxPct?: number;
  notes?: string;
}): Promise<Invoice> {
  return invoicesDb.createInvoice(payload);
}

export async function updateInvoice(
  invoiceId: string,
  payload: Partial<{ issueDate: string; dueDate: string; lineItems: InvoiceLineItem[]; taxPct: number; notes: string }>
): Promise<boolean> {
  return invoicesDb.updateInvoice(invoiceId, payload);
}

export async function markInvoiceSent(invoiceId: string): Promise<boolean> {
  return invoicesDb.markInvoiceSent(invoiceId);
}

export type { PaymentReceivedRow, PaymentReceivedWithMeta, CreatePaymentReceivedPayload, PaymentMethod } from "../payments-received-db";
export { PAYMENT_METHODS } from "../payments-received-db";
export async function getPaymentsReceived() {
  return paymentsReceivedDb.getPaymentsReceived();
}
export async function getPaymentsReceivedByInvoiceId(invoiceId: string) {
  return paymentsReceivedDb.getPaymentsReceivedByInvoiceId(invoiceId);
}
export async function getSumPaymentsReceivedByInvoiceId(invoiceId: string) {
  return paymentsReceivedDb.getSumPaymentsReceivedByInvoiceId(invoiceId);
}
export async function createPaymentReceived(payload: import("../payments-received-db").CreatePaymentReceivedPayload) {
  return paymentsReceivedDb.createPaymentReceived(payload);
}

export type { DepositRow, DepositWithMeta } from "../deposits-db";
export async function getDeposits() {
  return depositsDb.getDeposits();
}
export async function getDepositsByInvoiceId(invoiceId: string) {
  return depositsDb.getDepositsByInvoiceId(invoiceId);
}
export async function getTotalDepositsAmount() {
  return depositsDb.getTotalDepositsAmount();
}

export async function duplicateInvoice(invoiceId: string): Promise<Invoice | null> {
  const inv = await invoicesDb.getInvoiceById(invoiceId);
  if (!inv || inv.status === "Void") return null;
  const now = new Date().toISOString().slice(0, 10);
  return invoicesDb.createInvoice({
    projectId: inv.projectId,
    clientName: inv.clientName,
    issueDate: now,
    dueDate: now,
    lineItems: inv.lineItems,
    taxPct: inv.taxPct,
    notes: inv.notes,
  });
}

export interface ProjectInvoiceARAggregate {
  invoicedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  overdueBalance: number;
}

export async function getInvoicesByProject(projectId: string): Promise<ProjectInvoiceARAggregate> {
  return invoicesDb.getInvoicesByProjectAggregate(projectId);
}

export async function getInvoicePaymentsByProject(projectId: string): Promise<InvoicePayment[]> {
  const invs = await invoicesDb.getInvoicesByProject(projectId);
  const ids = new Set(invs.map((i) => i.id));
  const allPayments = await invoicesDb.getInvoicePayments();
  return allPayments.filter((p) => ids.has(p.invoiceId));
}

export async function getProjectRevenueFromInvoices(projectId: string): Promise<number> {
  const agg = await invoicesDb.getInvoicesByProjectAggregate(projectId);
  return agg.invoicedTotal;
}

export async function getProjectCollectedFromInvoicePayments(projectId: string): Promise<number> {
  const agg = await invoicesDb.getInvoicesByProjectAggregate(projectId);
  return agg.paidTotal;
}

export async function getProjectARBalance(projectId: string): Promise<number> {
  const agg = await invoicesDb.getInvoicesByProjectAggregate(projectId);
  return agg.balanceTotal;
}

export interface ARSummary {
  totalAR: number;
  overdueAR: number;
  paidThisMonth: number;
}

export async function getARSummary(): Promise<ARSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = today.slice(0, 7) + "-01";
  const withDerived = await invoicesDb.getInvoicesWithDerived();
  let totalAR = 0;
  let overdueAR = 0;
  const payments = await invoicesDb.getInvoicePayments();
  let paidThisMonth = 0;
  for (const inv of withDerived) {
    if (inv.computedStatus === "Void") continue;
    if (inv.computedStatus === "Unpaid" || inv.computedStatus === "Partial" || inv.computedStatus === "Overdue") {
      totalAR += inv.balanceDue;
      if (inv.dueDate < today) overdueAR += inv.balanceDue;
    }
  }
  for (const p of payments) {
    if (p.status !== "Voided" && p.date >= startOfMonth && p.date <= today) paidThisMonth += p.amount;
  }
  return { totalAR, overdueAR, paidThisMonth };
}

export async function getOutstandingInvoices(): Promise<InvoiceWithDerived[]> {
  const list = await getInvoicesWithDerived();
  return list.filter((i) => i.computedStatus === "Unpaid" || i.computedStatus === "Partial" || i.computedStatus === "Overdue");
}

export async function getProjectBillingSummary(projectId: string): Promise<{
  invoicedTotal: number;
  paidTotal: number;
  arBalance: number;
  lastPaymentDate: string | null;
}> {
  const projectInvoices = (await getInvoicesWithDerived({ projectId })).filter((i) => i.computedStatus !== "Void");
  let invoicedTotal = 0;
  let paidTotal = 0;
  let arBalance = 0;
  let lastPaymentDate: string | null = null;
  for (const inv of projectInvoices) {
    invoicedTotal += inv.total;
    paidTotal += inv.paidTotal;
    arBalance += inv.balanceDue;
  const payments = await getPaymentsByInvoiceId(inv.id);
    for (const p of payments) {
      if (!lastPaymentDate || p.date > lastPaymentDate) lastPaymentDate = p.date;
    }
  }
  return { invoicedTotal, paidTotal, arBalance, lastPaymentDate };
}

export interface ProjectFinancialSummary {
  budget: number;
  spent: number;
  revenue: number;
  collected: number;
  outstanding: number;
  profit: number;
  cashflow: number;
}

/** Project financial summary: budget from project; spent = canonical actualCost (labor+expense+subcontract); revenue/collected from invoices. Display "spent" uses canonical only; project.spent is legacy and not used here. */
export async function getProjectFinancialSummary(projectId: string): Promise<ProjectFinancialSummary | null> {
  const project = await projectsDb.getProjectById(projectId);
  if (!project) return null;
  const [canonical, invoiceData] = await Promise.all([
    getCanonicalProjectProfit(projectId),
    invoicesDb.getProjectRevenueAndCollected(projectId),
  ]);
  const { revenue, collected } = invoiceData;
  const budget = Number(project.budget) || 0;
  const spent = canonical.actualCost;
  const outstanding = Math.max(0, revenue - collected);
  const profit = revenue - spent;
  const cashflow = collected - spent;
  return {
    budget,
    spent,
    revenue,
    collected,
    outstanding,
    profit,
    cashflow,
  };
}

/** Forecast margin % and whether any cost code is >10% over budget. Used for project list risk. No mock. */
export async function getProjectForecastRisk(projectId: string): Promise<{ forecastMarginPct: number; anyCostCodeVarianceOver10Pct: boolean }> {
  const [summary, laborEntries, subcontractTotal, expenseTotal, subcontracts, budgetItems, expenseLines] = await Promise.all([
    getProjectFinancialSummary(projectId),
    dailyLaborDb.getLaborEntriesWithJoins({ project_id: projectId }),
    subcontractBillsDb.getApprovedSubcontractBillsTotalByProject(projectId),
    expensesDb.getExpenseTotalsByProject(projectId),
    subcontractsDb.getSubcontractsByProject(projectId),
    coDb.getProjectBudgetItems(projectId),
    expensesDb.getProjectExpenseLines(projectId),
  ]);
  const revenue = summary?.revenue ?? 0;
  const laborActual = (laborEntries ?? []).reduce((s: number, e) => s + (Number(e.cost_amount) || 0), 0);
  const totalCost = laborActual + subcontractTotal + expenseTotal;
  const totalSubcontractContractAmount = (subcontracts ?? []).reduce((s: number, c: { contract_amount: number }) => s + c.contract_amount, 0);
  const remainingCommitment = totalSubcontractContractAmount - subcontractTotal;
  const forecastFinalCost = totalCost + remainingCommitment;
  const forecastMarginPct = revenue > 0 ? ((revenue - forecastFinalCost) / revenue) * 100 : 0;

  let anyCostCodeVarianceOver10Pct = false;
  if ((budgetItems ?? []).length > 0 && subcontracts) {
    const subcontractIds = subcontracts.map((s: { id: string }) => s.id);
    const bills = subcontractIds.length > 0 ? await subcontractBillsDb.getBillsBySubcontractIds(subcontractIds) : [];
    const budgetByCostCode = new Map<string, number>();
    for (const item of budgetItems) {
      const code = item.cost_code ?? "";
      budgetByCostCode.set(code, (budgetByCostCode.get(code) ?? 0) + Number(item.total));
    }
    const laborByCostCode = new Map<string, number>();
    for (const e of laborEntries ?? []) {
      const code = e.cost_code ?? "";
      laborByCostCode.set(code, (laborByCostCode.get(code) ?? 0) + (Number(e.cost_amount) || 0));
    }
    const subcontractIdToCostCode = new Map(subcontracts.map((s: { id: string; cost_code: string | null }) => [s.id, s.cost_code ?? ""]));
    const approvedBillsByCostCode = new Map<string, number>();
    for (const b of bills) {
      if (b.status !== "Approved" && b.status !== "Paid") continue;
      const code = subcontractIdToCostCode.get(b.subcontract_id) ?? "";
      approvedBillsByCostCode.set(code, (approvedBillsByCostCode.get(code) ?? 0) + b.amount);
    }
    const expenseByCostCode = new Map<string, number>();
    for (const { line } of expenseLines ?? []) {
      const code = line.costCode ?? "";
      expenseByCostCode.set(code, (expenseByCostCode.get(code) ?? 0) + line.amount);
    }
    const contractAmountByCostCode = new Map<string, number>();
    for (const s of subcontracts) {
      const code = (s as { cost_code: string | null }).cost_code ?? "";
      contractAmountByCostCode.set(code, (contractAmountByCostCode.get(code) ?? 0) + (s as { contract_amount: number }).contract_amount);
    }
    const costCodes = Array.from(new Set(budgetItems.map((b: { cost_code?: string }) => b.cost_code ?? "")));
    for (const code of costCodes) {
      const budget = budgetByCostCode.get(code) ?? 0;
      const labor = laborByCostCode.get(code) ?? 0;
      const billsApproved = approvedBillsByCostCode.get(code) ?? 0;
      const expense = expenseByCostCode.get(code) ?? 0;
      const actual = labor + billsApproved + expense;
      const contractAmount = contractAmountByCostCode.get(code) ?? 0;
      const remaining = contractAmount - billsApproved;
      const forecast = actual + remaining;
      const variance = forecast - budget;
      if (budget > 0 && variance > budget * 0.1) {
        anyCostCodeVarianceOver10Pct = true;
        break;
      }
    }
  }
  return { forecastMarginPct, anyCostCodeVarianceOver10Pct };
}

export type ProjectForecastSummary = {
  revenue: number;
  actualCost: number;
  remainingCommitment: number;
  forecastFinalCost: number;
  forecastProfit: number;
  forecastMarginPct: number;
};

export type ProjectCostCodeVariance = { costCode: string; variance: number };

/** Full forecast summary per project. Optionally include cost code variances (forecast - budget) for owner dashboard. No mock. */
export async function getProjectForecastSummary(
  projectId: string,
  options?: { includeCostCodeVariances?: boolean }
): Promise<ProjectForecastSummary & { costCodeVariances?: ProjectCostCodeVariance[] }> {
  const [summary, laborEntries, subcontractTotal, expenseTotal, subcontracts, budgetItems, expenseLines] = await Promise.all([
    getProjectFinancialSummary(projectId),
    dailyLaborDb.getLaborEntriesWithJoins({ project_id: projectId }),
    subcontractBillsDb.getApprovedSubcontractBillsTotalByProject(projectId),
    expensesDb.getExpenseTotalsByProject(projectId),
    subcontractsDb.getSubcontractsByProject(projectId),
    coDb.getProjectBudgetItems(projectId),
    expensesDb.getProjectExpenseLines(projectId),
  ]);
  const revenue = summary?.revenue ?? 0;
  const laborActual = (laborEntries ?? []).reduce((s: number, e) => s + (Number(e.cost_amount) || 0), 0);
  const actualCost = laborActual + subcontractTotal + expenseTotal;
  const totalSubcontractContractAmount = (subcontracts ?? []).reduce((s: number, c: { contract_amount: number }) => s + c.contract_amount, 0);
  const remainingCommitment = totalSubcontractContractAmount - subcontractTotal;
  const forecastFinalCost = actualCost + remainingCommitment;
  const forecastProfit = revenue - forecastFinalCost;
  const forecastMarginPct = revenue > 0 ? ((revenue - forecastFinalCost) / revenue) * 100 : 0;

  const result: ProjectForecastSummary & { costCodeVariances?: ProjectCostCodeVariance[] } = {
    revenue,
    actualCost,
    remainingCommitment,
    forecastFinalCost,
    forecastProfit,
    forecastMarginPct,
  };

  if (options?.includeCostCodeVariances && (budgetItems ?? []).length > 0 && subcontracts) {
    const subcontractIds = subcontracts.map((s: { id: string }) => s.id);
    const bills = subcontractIds.length > 0 ? await subcontractBillsDb.getBillsBySubcontractIds(subcontractIds) : [];
    const budgetByCostCode = new Map<string, number>();
    for (const item of budgetItems) {
      const code = item.cost_code ?? "";
      budgetByCostCode.set(code, (budgetByCostCode.get(code) ?? 0) + Number(item.total));
    }
    const laborByCostCode = new Map<string, number>();
    for (const e of laborEntries ?? []) {
      const code = e.cost_code ?? "";
      laborByCostCode.set(code, (laborByCostCode.get(code) ?? 0) + (Number(e.cost_amount) || 0));
    }
    const subcontractIdToCostCode = new Map(subcontracts.map((s: { id: string; cost_code: string | null }) => [s.id, s.cost_code ?? ""]));
    const approvedBillsByCostCode = new Map<string, number>();
    for (const b of bills) {
      if (b.status !== "Approved" && b.status !== "Paid") continue;
      const code = subcontractIdToCostCode.get(b.subcontract_id) ?? "";
      approvedBillsByCostCode.set(code, (approvedBillsByCostCode.get(code) ?? 0) + b.amount);
    }
    const expenseByCostCode = new Map<string, number>();
    for (const { line } of expenseLines ?? []) {
      const code = line.costCode ?? "";
      expenseByCostCode.set(code, (expenseByCostCode.get(code) ?? 0) + line.amount);
    }
    const contractAmountByCostCode = new Map<string, number>();
    for (const s of subcontracts) {
      const code = (s as { cost_code: string | null }).cost_code ?? "";
      contractAmountByCostCode.set(code, (contractAmountByCostCode.get(code) ?? 0) + (s as { contract_amount: number }).contract_amount);
    }
    const costCodes = Array.from(new Set(budgetItems.map((b: { cost_code?: string }) => b.cost_code ?? "")));
    result.costCodeVariances = costCodes.map((code) => {
      const budget = budgetByCostCode.get(code) ?? 0;
      const labor = laborByCostCode.get(code) ?? 0;
      const billsApproved = approvedBillsByCostCode.get(code) ?? 0;
      const expense = expenseByCostCode.get(code) ?? 0;
      const actual = labor + billsApproved + expense;
      const contractAmount = contractAmountByCostCode.get(code) ?? 0;
      const remaining = contractAmount - billsApproved;
      const forecast = actual + remaining;
      const variance = forecast - budget;
      return { costCode: code || "—", variance };
    });
  }

  return result;
}

export type CompanyFinancialDashboard = {
  budget: number;
  spent: number;
  revenue: number;
  collected: number;
  profit: number;
  cashflow: number;
};

/** Company financial dashboard: budget from projects; spent = sum of canonical actualCost per project (labor+expense+subcontract); revenue/collected from invoices. project.spent not used for display. */
export async function getCompanyFinancialDashboard(): Promise<CompanyFinancialDashboard> {
  const [projects, revenueData] = await Promise.all([
    getProjects(),
    invoicesDb.getCompanyRevenueAndCollected(),
  ]);
  const budget = projects.reduce((s, p) => s + (Number(p.budget) || 0), 0);
  const profitMap = await getCanonicalProjectProfitBatch(projects.map((p) => p.id)).catch(() => new Map());
  const spent = projects.reduce((s, p) => s + (profitMap.get(p.id)?.actualCost ?? 0), 0);
  const { revenue, collected } = revenueData;
  const profit = revenue - spent;
  const cashflow = collected - spent;
  return { budget, spent, revenue, collected, profit, cashflow };
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

export async function importBankTransactionsFromCsv(csvText: string): Promise<BankTransaction[]> {
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
    const tx = await bankTxDb.createBankTransaction({ date, description, amount, status: "unmatched" });
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

export async function reconcileBankTransaction(params: ReconcileParams): Promise<BankTransaction | null> {
  const tx = await bankTxDb.getBankTransactionById(params.bankTxId);
  if (!tx) return null;
  const now = new Date().toISOString().slice(0, 10);
  if (params.type === "Expense") {
    const targetAmount = Math.abs(tx.amount);
    const useLines = params.lines && params.lines.length > 0;
    const linePayload = useLines
      ? params.lines!.map((l) => ({
          projectId: l.projectId ?? null,
          category: l.category ?? "Other",
          memo: l.memo ?? null,
          amount: l.amount ?? 0,
        }))
      : [
          {
            projectId: params.projectId ?? null,
            category: params.category ?? "Other",
            memo: params.memo ?? tx.description ?? null,
            amount: targetAmount,
          },
        ];
    const expense = await createExpense({
      date: tx.date,
      vendorName: params.vendorName ?? tx.description,
      paymentMethod: params.paymentMethod ?? "ACH",
      notes: useLines ? undefined : params.memo,
      lines: linePayload,
      linkedBankTxId: tx.id,
    });
    await bankTxDb.updateBankTransaction(params.bankTxId, {
      status: "reconciled",
      linkedExpenseId: expense.id,
      reconciledAt: now,
      reconciledBy: "owner",
    });
  }
  return bankTxDb.getBankTransactionById(params.bankTxId);
}

/** Link an existing expense to this bank transaction (1:1). Fails if either is already linked elsewhere. */
export async function linkBankTransactionToExpense(bankTxId: string, expenseId: string): Promise<boolean> {
  return bankTxDb.linkBankTransactionToExpense(bankTxId, expenseId);
}

/** Unlink bank transaction from expense; both sides cleared, bank tx becomes unmatched. */
export async function unlinkBankTransaction(bankTxId: string): Promise<boolean> {
  return bankTxDb.unlinkBankTransaction(bankTxId);
}

export interface ExpenseSuggestion {
  expense: Expense;
  total: number;
  score: number;
  projectLabel: string;
  categoryLabel: string;
  memoLabel: string;
}

/** Up to 8 suggested expenses for linking: unlinked only, sorted by match score. */
export async function getSuggestedExpensesForBankTx(bankTx: BankTransaction): Promise<ExpenseSuggestion[]> {
  const [projects, unlinked] = await Promise.all([getProjects(), expensesDb.getUnlinkedExpenses()]);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const targetAmount = Math.abs(bankTx.amount);
  const txDate = new Date(bankTx.date).getTime();
  const descLower = bankTx.description.toLowerCase();
  const withScore: ExpenseSuggestion[] = unlinked.map((exp) => {
    const total = exp.lines.reduce((s, l) => s + l.amount, 0);
    let score = 0;
    if (total > 0 && Math.abs(total - targetAmount) < 0.01) score += 100;
    const expDate = new Date(exp.date).getTime();
    const daysDiff = Math.abs((txDate - expDate) / (24 * 60 * 60 * 1000));
    if (daysDiff <= 3) score += Math.max(0, 30 - daysDiff * 10);
    if (exp.vendorName && descLower.includes(exp.vendorName.toLowerCase())) score += 20;
    if (exp.vendorName && exp.vendorName.toLowerCase().includes(descLower)) score += 20;
    const projectId = exp.lines[0]?.projectId;
    const projectLabel = projectId ? (projectMap.get(projectId ?? "") ?? projectId) : "Overhead";
    const categoryLabel = exp.lines[0]?.category ?? "—";
    const memoLabel = exp.lines[0]?.memo?.trim() || "—";
    return { expense: exp, total, score, projectLabel, categoryLabel, memoLabel };
  });
  return withScore.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function getProjectLabor(projectId: string): ProjectLaborRow[] {
  void projectId; // reserved for future labor integration
  return [];
}

export function getProjectTransactions(projectId: string): ProjectTransactionRow[] {
  void projectId; // reserved for future transaction integration
  return [];
}

export async function getProjectEstimate(projectId: string): Promise<{ projectId: string; revenue: number; cost: number; materialsCost: number; laborCost: number; vendorCost: number; otherCost: number } | undefined> {
  const project = await getProjectById(projectId);
  if (!project || !project.sourceEstimateId) return undefined;
  const b = project.snapshotBudgetBreakdown;
  return {
    projectId: project.id,
    revenue: project.snapshotRevenue ?? project.budget,
    cost: project.snapshotBudgetCost ?? project.budget,
    materialsCost: b?.materials ?? 0,
    laborCost: b?.labor ?? 0,
    vendorCost: b?.vendor ?? 0,
    otherCost: b?.other ?? 0,
  };
}

export type CostCode = (typeof costCodeMaster)[number];

function estimateCodeToType(code: string): "material" | "labor" | "subcontractor" | undefined {
  const c = costCodeMaster.find((x) => x.code === code);
  if (!c || !("type" in c)) return undefined;
  return (c as { type: "material" | "labor" | "subcontractor" }).type;
}

export type { EstimateListItem, EstimateItemRow, EstimateMetaRecord, EstimateSummary, PaymentScheduleItem, PaymentScheduleTemplate } from "../estimates-db";

export function getEstimateSnapshots(estimateId: string): Promise<{ snapshotId: string; estimateId: string; version: number; createdAt: string; statusAtSnapshot: string; frozenPayload: unknown }[]> {
  return estDb.listEstimateSnapshots(estimateId).then((rows) =>
    rows.map((s) => ({
      snapshotId: s.snapshotId,
      estimateId: s.estimateId,
      version: s.version,
      createdAt: s.createdAt,
      statusAtSnapshot: s.statusAtSnapshot,
      frozenPayload: s.frozenPayload,
    }))
  );
}

export async function getEstimateSnapshot(estimateId: string, version: number): Promise<estDb.EstimateSnapshotRecord | null> {
  return estDb.getEstimateSnapshotByVersion(estimateId, version);
}

export async function createEstimateSnapshot(estimateId: string): Promise<string | null> {
  return estDb.createEstimateSnapshot(estimateId);
}

export function createNewVersionFromSnapshot(estimateId: string): Promise<boolean> {
  return estDb.createNewVersionFromSnapshot(estimateId);
}

export async function convertEstimateSnapshotToProject(estimateId: string): Promise<ProjectFromEstimate | null> {
  const existing = await getProjectFromEstimate(estimateId);
  if (existing) return { ...existing };

  const [estimate, meta, items] = await Promise.all([
    estDb.getEstimateById(estimateId),
    estDb.getEstimateMeta(estimateId),
    estDb.getEstimateItems(estimateId),
  ]);
  if (!estimate || !meta) return null;
  if (estimate.status !== "Approved") return null;

  const s = estDb.computeSummary(items, meta, estimateCodeToType);

  // Canonical contract value: store in projects.budget so profit-engine and dashboard use it as revenue base.
  // Lock estimate by moving to Converted (allowed only from Approved).
  const locked = await estDb.setEstimateStatus(estimateId, "Converted");
  if (!locked) return null;

  const project = await projectsDb.createProject({
    name: meta.project.name?.trim() || estimate.project?.trim() || `Project ${estimate.number}`,
    budget: s.total,
    status: "active",
    sourceEstimateId: estimateId,
    snapshotRevenue: s.total,
    snapshotBudgetCost: s.subtotal,
    snapshotBreakdown: {
      materials: s.materialCost,
      labor: s.laborCost,
      vendor: s.subcontractorCost,
      other: 0,
    },
  });

  return {
    projectId: project.id,
    sourceEstimateId: estimateId,
    sourceSnapshotId: `estimate-${estimateId}`,
    sourceVersion: 1,
    snapshotRevenue: s.total,
    snapshotBudgetCost: s.subtotal,
    snapshotBudgetBreakdown: {
      materials: s.materialCost,
      labor: s.laborCost,
      vendor: s.subcontractorCost,
      other: 0,
    },
  };
}

export interface ConvertToProjectPayload {
  projectName: string;
  client?: string;
  address?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  estimateRef?: string;
}

/**
 * Convert an Approved estimate to a project with editable setup fields.
 * Duplication: returns null if this estimate was already converted (getProjectFromEstimate).
 * Lock: sets estimate status to Converted first; only then creates project and copies budget.
 */
export async function convertEstimateToProjectWithSetup(
  estimateId: string,
  payload: ConvertToProjectPayload
): Promise<ProjectFromEstimate | null> {
  const existing = await getProjectFromEstimate(estimateId);
  if (existing) return null;

  const [estimate, meta, items] = await Promise.all([
    estDb.getEstimateById(estimateId),
    estDb.getEstimateMeta(estimateId),
    estDb.getEstimateItems(estimateId),
  ]);
  if (!estimate || !meta) return null;
  if (estimate.status !== "Approved") return null;

  const locked = await estDb.setEstimateStatus(estimateId, "Converted");
  if (!locked) return null;

  const s = estDb.computeSummary(items, meta, estimateCodeToType);
  const name = payload.projectName?.trim() || meta.project.name?.trim() || estimate.project?.trim() || `Project ${estimate.number}`;

  // Canonical contract value: store in projects.budget so profit-engine and dashboard use it as revenue base.
  const project = await projectsDb.createProject({
    name,
    budget: s.total,
    status: "active",
    client: payload.client,
    address: payload.address,
    projectManager: payload.projectManager,
    startDate: payload.startDate,
    endDate: payload.endDate,
    notes: payload.notes,
    estimateRef: payload.estimateRef,
    sourceEstimateId: estimateId,
    snapshotRevenue: s.total,
    snapshotBudgetCost: s.subtotal,
    snapshotBreakdown: {
      materials: s.materialCost,
      labor: s.laborCost,
      vendor: s.subcontractorCost,
      other: 0,
    },
  });

  return {
    projectId: project.id,
    sourceEstimateId: estimateId,
    sourceSnapshotId: `estimate-${estimateId}`,
    sourceVersion: 1,
    snapshotRevenue: s.total,
    snapshotBudgetCost: s.subtotal,
    snapshotBudgetBreakdown: {
      materials: s.materialCost,
      labor: s.laborCost,
      vendor: s.subcontractorCost,
      other: 0,
    },
  };
}

export function setEstimateStatus(estimateId: string, nextStatus: "Sent" | "Approved" | "Rejected" | "Converted"): Promise<boolean> {
  return estDb.setEstimateStatus(estimateId, nextStatus);
}

export function updateEstimateStatus(estimateId: string, newStatus: estDb.EstimateStatus): Promise<boolean> {
  return estDb.updateEstimateStatus(estimateId, newStatus);
}

export async function getProjectFromEstimate(estimateId: string): Promise<ProjectFromEstimate | null> {
  const project = await projectsDb.getProjectBySourceEstimateId(estimateId);
  if (!project || !project.sourceEstimateId) return null;
  const b = project.snapshotBudgetBreakdown;
  return {
    projectId: project.id,
    sourceEstimateId: project.sourceEstimateId,
    sourceSnapshotId: `estimate-${project.sourceEstimateId}`,
    sourceVersion: 1,
    snapshotRevenue: project.snapshotRevenue ?? project.budget,
    snapshotBudgetCost: project.snapshotBudgetCost ?? undefined,
    snapshotBudgetBreakdown: b
      ? { materials: b.materials, labor: b.labor, vendor: b.vendor, other: b.other }
      : undefined,
  };
}

export async function getSourceForProject(projectId: string): Promise<ProjectFromEstimate | null> {
  const project = await getProjectById(projectId);
  if (!project || !("sourceEstimateId" in project) || !project.sourceEstimateId) return null;
  const b = project.snapshotBudgetBreakdown;
  return {
    projectId: project.id,
    sourceEstimateId: project.sourceEstimateId,
    sourceSnapshotId: `estimate-${project.sourceEstimateId}`,
    sourceVersion: 1,
    snapshotRevenue: project.snapshotRevenue ?? project.budget,
    snapshotBudgetCost: project.snapshotBudgetCost ?? undefined,
    snapshotBudgetBreakdown: b
      ? { materials: b.materials, labor: b.labor, vendor: b.vendor, other: b.other }
      : undefined,
  };
}

export function getCostCodes(): CostCode[] {
  return [...costCodeMaster];
}

export function getEstimateById(id: string): Promise<EstimateListItem | null> {
  return estDb.getEstimateById(id);
}

export function getEstimateList(): Promise<EstimateListItem[]> {
  return estDb.getEstimateList(estimateCodeToType);
}

export function getEstimateItems(estimateId: string): Promise<EstimateItemRow[]> {
  return estDb.getEstimateItems(estimateId);
}

export function getEstimateMeta(estimateId: string): Promise<estDb.EstimateMetaRecord | null> {
  return estDb.getEstimateMeta(estimateId);
}

export function getEstimateCategories(estimateId: string): Promise<{ costCode: string; displayName: string }[]> {
  return estDb.getEstimateCategories(estimateId);
}

export function getPaymentSchedule(estimateId: string): Promise<estDb.PaymentScheduleItem[]> {
  return estDb.getPaymentSchedule(estimateId);
}

export function addPaymentMilestone(
  estimateId: string,
  item: { title: string; amountType: "percent" | "fixed"; value: number; dueRule: string; dueDate?: string | null; notes?: string | null }
) {
  return estDb.addPaymentMilestone(estimateId, item);
}

export function updatePaymentMilestone(
  estimateId: string,
  itemId: string,
  payload: { title?: string; amountType?: "percent" | "fixed"; value?: number; dueRule?: string; dueDate?: string | null; notes?: string | null }
): Promise<boolean> {
  return estDb.updatePaymentMilestone(estimateId, itemId, payload);
}

export function deletePaymentMilestone(estimateId: string, itemId: string): Promise<boolean> {
  return estDb.deletePaymentMilestone(estimateId, itemId);
}

export function markPaymentMilestonePaid(estimateId: string, itemId: string): Promise<boolean> {
  return estDb.markPaymentMilestonePaid(estimateId, itemId);
}

export function reorderPaymentSchedule(estimateId: string, orderedItemIds: string[]): Promise<boolean> {
  return estDb.reorderPaymentSchedule(estimateId, orderedItemIds);
}

export function paymentMilestoneAmount(item: estDb.PaymentScheduleItem, estimateTotal: number): number {
  return estDb.paymentMilestoneAmount(item, estimateTotal);
}

export function listPaymentTemplates(): Promise<estDb.PaymentScheduleTemplate[]> {
  return estDb.listPaymentTemplates();
}

export function createPaymentTemplate(
  name: string,
  items: Array<{ title: string; amountType: "percent" | "fixed"; value: number; dueRule: string; notes?: string | null }>
): Promise<estDb.PaymentScheduleTemplate | null> {
  return estDb.createPaymentTemplate(name, items);
}

export function applyPaymentTemplateToEstimate(estimateId: string, templateId: string): Promise<boolean> {
  return estDb.applyPaymentTemplateToEstimate(estimateId, templateId);
}

export function updateEstimateMeta(
  estimateId: string,
  payload: {
    client?: { name?: string; phone?: string; email?: string; address?: string };
    project?: { name?: string; siteAddress?: string };
    costCategoryNames?: Record<string, string>;
    tax?: number;
    discount?: number;
    overheadPct?: number;
    profitPct?: number;
    estimateDate?: string;
    validUntil?: string;
    notes?: string;
    salesPerson?: string;
  }
): Promise<boolean> {
  return estDb.updateEstimateMeta(estimateId, {
    ...payload,
    categoryNames: payload.costCategoryNames,
  });
}

export function addLineItem(
  estimateId: string,
  item: { costCode: string; desc: string; qty: number; unit: string; unitCost: number; markupPct: number }
) {
  return estDb.addLineItem(estimateId, item);
}

export function updateLineItem(
  estimateId: string,
  itemId: string,
  payload: { desc?: string; qty?: number; unit?: string; unitCost?: number; markupPct?: number }
): Promise<boolean> {
  return estDb.updateLineItem(estimateId, itemId, payload);
}

export function deleteLineItem(estimateId: string, itemId: string): Promise<boolean> {
  return estDb.deleteLineItem(estimateId, itemId);
}

export function duplicateLineItem(estimateId: string, itemId: string): Promise<EstimateItemRow | null> {
  return estDb.duplicateLineItem(estimateId, itemId);
}

export function deleteEstimate(estimateId: string): Promise<boolean> {
  return estDb.deleteEstimate(estimateId);
}

export function createEstimate(payload: {
  clientName: string;
  projectName: string;
  address: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  salesPerson?: string;
}): Promise<string> {
  return estDb.createEstimate(payload);
}

export function createEstimateWithItems(payload: {
  clientName: string;
  projectName: string;
  address: string;
  estimateDate?: string;
  validUntil?: string;
  notes?: string;
  salesPerson?: string;
  tax?: number;
  discount?: number;
  overheadPct?: number;
  profitPct?: number;
  costCategoryNames?: Record<string, string>;
  items: Array<{ costCode: string; desc: string; qty: number; unit: string; unitCost: number; markupPct: number }>;
  paymentSchedule?: Array<{ title: string; amountType: "percent" | "fixed"; value: number; dueRule: string; notes?: string | null }>;
}): Promise<string> {
  return estDb.createEstimateWithItems({
    ...payload,
    categoryNames: payload.costCategoryNames,
    paymentSchedule: payload.paymentSchedule,
  });
}

export function estimateLineTotal(row: EstimateItemRow): number {
  return estDb.lineTotal(row);
}

export interface EstimateSummaryResult {
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  subtotal: number;
  tax: number;
  discount: number;
  markup: number;
  grandTotal: number;
  overheadPct: number;
  profitPct: number;
  overhead: number;
  profit: number;
}

export async function getEstimateSummary(estimateId: string): Promise<EstimateSummaryResult | null> {
  const meta = await estDb.getEstimateMeta(estimateId);
  if (!meta) return null;
  const items = await estDb.getEstimateItems(estimateId);
  const s = estDb.computeSummary(items, meta, estimateCodeToType);
  const overheadPct = meta.overheadPct ?? 0.05;
  const profitPct = meta.profitPct ?? 0.1;
  return {
    materialCost: s.materialCost,
    laborCost: s.laborCost,
    subcontractorCost: s.subcontractorCost,
    subtotal: s.subtotal,
    tax: s.tax,
    discount: s.discount,
    markup: s.markup,
    grandTotal: s.total,
    overheadPct,
    profitPct,
    overhead: s.subtotal * overheadPct,
    profit: s.subtotal * profitPct,
  };
}

/** Used by snapshot [version] page when displaying a frozen payload. */
export function getEstimateSummaryFromPayload(payload: {
  items: Array<{ qty: number; unitCost: number; markupPct: number }>;
  overheadPct: number;
  profitPct: number;
}): { subtotal: number; overheadPct: number; profitPct: number; overhead: number; profit: number; grandTotal: number } {
  const subtotal = payload.items.reduce((s, row) => s + row.qty * row.unitCost * (1 + row.markupPct), 0);
  const overhead = subtotal * payload.overheadPct;
  const profit = subtotal * payload.profitPct;
  return {
    subtotal,
    overheadPct: payload.overheadPct,
    profitPct: payload.profitPct,
    overhead,
    profit,
    grandTotal: subtotal + overhead + profit,
  };
}

export interface ProjectDetailFinancial {
  /** Display "spent" / actualCost is canonical only: labor + expense + subcontract (getCanonicalProjectProfit). project.spent is legacy and must not be used for UI. */
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

export async function getProjectDetailFinancial(projectId: string): Promise<ProjectDetailFinancial | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;

  const canonical = await getCanonicalProjectProfit(projectId);
  const totalBudget = canonical.budget;
  const totalRevenue = canonical.revenue;
  const totalSpent = canonical.actualCost;
  const profit = canonical.profit;
  const marginPct = canonical.revenue > 0 ? canonical.margin * 100 : 0;
  const budgetUsagePct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingBudget = totalBudget - totalSpent;

  let riskStatus: string;
  if (profit < 0) riskStatus = "Loss";
  else if (budgetUsagePct >= 100) riskStatus = "Over budget";
  else if (budgetUsagePct >= 80) riskStatus = "At risk";
  else riskStatus = "On track";

  return {
    totalBudget,
    totalRevenue,
    totalSpent,
    incomeTotal: totalRevenue,
    expenseTotal: totalSpent,
    profit,
    marginPct,
    budgetUsagePct,
    remainingBudget,
    riskStatus,
    materialCost: 0,
    laborCost: -canonical.laborCost,
    vendorCost: -canonical.subcontractCost,
    otherCost: -canonical.expenseCost,
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

/** Computes risk overview from projects + sources + financial. Null-safe. */
export async function getProjectRiskOverview(): Promise<ProjectRiskOverview> {
  const projects = await getProjects();
  const rows: ProjectRiskRow[] = [];
  let highCount = 0;
  let overBudgetCount = 0;
  let laborOverCount = 0;
  let lowRunwayCount = 0;

  // Fetch financials in batch (5 queries total) + all sources in parallel.
  const [profitMap, sources] = await Promise.all([
    getCanonicalProjectProfitBatch(projects.map((p) => p.id)).catch(() => new Map()),
    Promise.all(projects.map((p) => getSourceForProject(p.id).catch(() => null))),
  ]);

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const source = sources[i];
    const canonical = profitMap.get(project.id);
    const financial: ProjectDetailFinancial | null = canonical
      ? {
          totalBudget: canonical.budget,
          totalRevenue: canonical.revenue,
          totalSpent: canonical.actualCost,
          incomeTotal: canonical.revenue,
          expenseTotal: canonical.actualCost,
          profit: canonical.profit,
          marginPct: canonical.revenue > 0 ? canonical.margin * 100 : 0,
          budgetUsagePct: canonical.budget > 0 ? (canonical.actualCost / canonical.budget) * 100 : 0,
          remainingBudget: canonical.budget - canonical.actualCost,
          riskStatus: canonical.profit < 0 ? "Loss" : canonical.budget > 0 && canonical.actualCost / canonical.budget >= 1 ? "Over budget" : canonical.budget > 0 && canonical.actualCost / canonical.budget >= 0.8 ? "At risk" : "On track",
          materialCost: 0,
          laborCost: -canonical.laborCost,
          vendorCost: -canonical.subcontractCost,
          otherCost: -canonical.expenseCost,
        }
      : null;
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
