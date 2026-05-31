import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import {
  buildSubcontractScheduleInsert,
  type SubcontractPaymentScheduleInsert,
  type SubcontractPaymentScheduleRow,
  type SubcontractScheduleStatus,
} from "@/lib/subcontract-ap-linkage";

const TABLE = "subcontract_payment_schedule";

type SupabaseLike = SupabaseClient;

export type SubcontractPaymentScheduleDraft = {
  subcontractId: string;
  projectId: string;
  subcontractorId: string;
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
};

export type CreateApBillFromScheduleResult = {
  apBillId: string;
  created: boolean;
};

function client(explicitClient?: SupabaseLike) {
  if (explicitClient) return explicitClient;
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  const m = err?.message ?? "";
  return (
    err?.code === "42P01" ||
    /schema cache|relation.*does not exist|could not find the table/i.test(m)
  );
}

function mapSchedule(row: Record<string, unknown>): SubcontractPaymentScheduleRow {
  return {
    id: (row.id as string) ?? "",
    subcontract_id: (row.subcontract_id as string) ?? "",
    project_id: (row.project_id as string) ?? "",
    subcontractor_id: (row.subcontractor_id as string) ?? "",
    title: (row.title as string) ?? "",
    description: (row.description as string | null) ?? null,
    amount: toNum(row.amount),
    due_date: row.due_date != null ? String(row.due_date).slice(0, 10) : null,
    status: ((row.status as string) ?? "draft") as SubcontractScheduleStatus,
    ap_bill_id: (row.ap_bill_id as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    updated_at: (row.updated_at as string | undefined) ?? undefined,
  };
}

export async function getPaymentScheduleBySubcontractId(
  subcontractId: string,
  explicitClient?: SupabaseLike
): Promise<SubcontractPaymentScheduleRow[]> {
  const { data, error } = await client(explicitClient)
    .from(TABLE)
    .select(
      "id, subcontract_id, project_id, subcontractor_id, title, description, amount, due_date, status, ap_bill_id, created_at, updated_at"
    )
    .eq("subcontract_id", subcontractId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payment schedule.");
  }
  return (data ?? []).map((row) => mapSchedule(row as Record<string, unknown>));
}

export async function getPaymentScheduleBySubcontractIds(
  subcontractIds: string[],
  explicitClient?: SupabaseLike
): Promise<SubcontractPaymentScheduleRow[]> {
  if (subcontractIds.length === 0) return [];
  const { data, error } = await client(explicitClient)
    .from(TABLE)
    .select(
      "id, subcontract_id, project_id, subcontractor_id, title, description, amount, due_date, status, ap_bill_id, created_at, updated_at"
    )
    .in("subcontract_id", subcontractIds)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payment schedules.");
  }
  return (data ?? []).map((row) => mapSchedule(row as Record<string, unknown>));
}

export async function insertPaymentScheduleItem(
  draft: SubcontractPaymentScheduleDraft,
  explicitClient?: SupabaseLike
): Promise<SubcontractPaymentScheduleRow> {
  const payload: SubcontractPaymentScheduleInsert = buildSubcontractScheduleInsert(draft);
  const { data, error } = await client(explicitClient)
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Subcontract payment schedule table is not configured.");
    }
    throw new Error(error.message ?? "Failed to create schedule item.");
  }
  return mapSchedule(data as Record<string, unknown>);
}

export async function createApBillFromScheduleItem(
  scheduleId: string,
  explicitClient?: SupabaseLike
): Promise<CreateApBillFromScheduleResult> {
  const { data, error } = await client(explicitClient).rpc(
    "create_ap_bill_from_subcontract_schedule",
    {
      p_schedule_id: scheduleId,
    }
  );
  if (error) throw new Error(error.message ?? "Failed to create AP bill from schedule.");

  const first = Array.isArray(data) ? data[0] : data;
  const apBillId = first && typeof first.ap_bill_id === "string" ? first.ap_bill_id : "";
  if (!apBillId) throw new Error("Failed to create AP bill from schedule.");

  return {
    apBillId,
    created: Boolean(first.created),
  };
}
