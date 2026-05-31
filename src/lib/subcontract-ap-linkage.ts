import type { ApBillType } from "@/lib/ap-bills-db";

export type SubcontractScheduleStatus =
  | "draft"
  | "scheduled"
  | "billed"
  | "paid"
  | "cancelled"
  | "void";

export type SubcontractPaymentScheduleRow = {
  id: string;
  subcontract_id: string;
  project_id: string;
  subcontractor_id: string;
  title: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: SubcontractScheduleStatus;
  ap_bill_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SubcontractPaymentScheduleInsert = {
  subcontract_id: string;
  project_id: string;
  subcontractor_id: string;
  title: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: SubcontractScheduleStatus;
};

export type SubcontractApBillDraft = {
  bill_type: ApBillType;
  vendor_name: string;
  project_id: string;
  subcontractor_id: string;
  subcontract_id: string;
  issue_date?: string | null;
  due_date: string | null;
  amount: number;
  category: string;
  notes: string | null;
};

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function requiredId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function dateOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildSubcontractScheduleInsert(input: {
  subcontractId: string;
  projectId: string;
  subcontractorId: string;
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
  status?: SubcontractScheduleStatus;
}): SubcontractPaymentScheduleInsert {
  const title = input.title.trim();
  if (!title) throw new Error("Schedule title is required.");
  const amount = money(input.amount);
  if (amount <= 0) throw new Error("Schedule amount must be greater than 0.");

  return {
    subcontract_id: requiredId(input.subcontractId, "Subcontract"),
    project_id: requiredId(input.projectId, "Project"),
    subcontractor_id: requiredId(input.subcontractorId, "Subcontractor"),
    title,
    description: textOrNull(input.description),
    amount,
    due_date: dateOrNull(input.dueDate),
    status: input.status ?? "draft",
  };
}

export function ensureScheduleCanCreateApBill(
  schedule: Pick<SubcontractPaymentScheduleRow, "id" | "status" | "ap_bill_id">
): void {
  if (schedule.ap_bill_id) {
    throw new Error("This schedule item already has an AP bill.");
  }
  if (schedule.status === "cancelled" || schedule.status === "void") {
    throw new Error("Cancelled or void schedule items cannot create AP bills.");
  }
}

export function buildApBillDraftFromSchedule(input: {
  schedule: Pick<
    SubcontractPaymentScheduleRow,
    | "id"
    | "subcontract_id"
    | "project_id"
    | "subcontractor_id"
    | "title"
    | "amount"
    | "due_date"
    | "status"
    | "ap_bill_id"
  >;
  subcontractorName: string;
  subcontractDescription?: string | null;
}): SubcontractApBillDraft {
  ensureScheduleCanCreateApBill(input.schedule);
  const amount = money(input.schedule.amount);
  if (amount <= 0) throw new Error("Schedule amount must be greater than 0.");

  const notes = [textOrNull(input.subcontractDescription), textOrNull(input.schedule.title)]
    .filter(Boolean)
    .join(" · ");

  return {
    bill_type: "Vendor",
    vendor_name: input.subcontractorName.trim() || "Subcontractor",
    project_id: input.schedule.project_id,
    subcontractor_id: input.schedule.subcontractor_id,
    subcontract_id: input.schedule.subcontract_id,
    due_date: input.schedule.due_date,
    amount,
    category: "Subcontract",
    notes: notes || null,
  };
}

export function applyApBillLinkToSchedule(
  apBillId: string
): Pick<SubcontractPaymentScheduleRow, "status" | "ap_bill_id"> {
  return {
    status: "billed",
    ap_bill_id: requiredId(apBillId, "AP bill"),
  };
}
