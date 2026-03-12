/**
 * Commitments (PO/Subcontract/Other) — Supabase only. No mock data.
 * Table: commitments. Attachments: entity_type = 'commitment'.
 */

import { supabase } from "@/lib/supabase";

export type CommitmentType = "PO" | "Subcontract" | "Other";
export type CommitmentStatus = "Open" | "Closed";

export type ExpenseAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
};

export type Commitment = {
  id: string;
  projectId: string;
  date: string;
  vendorName: string;
  type: CommitmentType;
  amount: number;
  status: CommitmentStatus;
  notes?: string;
  attachments: ExpenseAttachment[];
};

type CommitmentRow = {
  id: string;
  project_id: string;
  commitment_date?: string | null;
  date?: string | null;
  created_at?: string | null;
  vendor_name: string;
  commitment_type: string;
  amount: number;
  status: string;
  notes: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /schema cache|relation.*does not exist|could not find the table/i.test(m);
}

function isMissingColumn(err: { message?: string } | null, column: string): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes(`column`) && m.includes(column.toLowerCase()) && m.includes("does not exist");
}

function rowDate(r: CommitmentRow): string {
  return r.commitment_date?.slice(0, 10) ?? r.date?.slice(0, 10) ?? r.created_at?.slice(0, 10) ?? "";
}

async function getAttachments(commitmentId: string): Promise<ExpenseAttachment[]> {
  const c = client();
  const { data: rows } = await c
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, file_path, created_at")
    .eq("entity_type", "commitment")
    .eq("entity_id", commitmentId);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name ?? "",
    mimeType: r.mime_type ?? "",
    size: Number(r.size_bytes) || 0,
    url: r.file_path ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
  }));
}

function toCommitment(r: CommitmentRow, attachments: ExpenseAttachment[]): Commitment {
  const type = (r.commitment_type === "PO" || r.commitment_type === "Subcontract" || r.commitment_type === "Other" ? r.commitment_type : "Other") as CommitmentType;
  const status = (r.status === "Closed" ? "Closed" : "Open") as CommitmentStatus;
  return {
    id: r.id,
    projectId: r.project_id,
    date: rowDate(r),
    vendorName: r.vendor_name ?? "",
    type,
    amount: Number(r.amount) || 0,
    status,
    notes: r.notes ?? undefined,
    attachments,
  };
}

export async function getCommitments(projectId: string): Promise<Commitment[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("commitments")
    .select("*")
    .eq("project_id", projectId);
  if (error) {
    if (isMissingTable(error)) throw new Error("commitments: table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to load commitments.");
  }
  const list = ((rows ?? []) as CommitmentRow[]).sort((a, b) => rowDate(b).localeCompare(rowDate(a)));
  const result: Commitment[] = [];
  for (const row of list) {
    const r = row as CommitmentRow;
    const attachments = await getAttachments(r.id);
    result.push(toCommitment(r, attachments));
  }
  return result;
}

export async function createCommitment(payload: Omit<Commitment, "id" | "attachments"> & { attachments?: ExpenseAttachment[] }): Promise<Commitment> {
  const c = client();
  const basePayload = {
    project_id: payload.projectId,
    vendor_name: payload.vendorName ?? "",
    commitment_type: payload.type,
    amount: Math.max(0, payload.amount),
    status: payload.status ?? "Open",
    notes: payload.notes ?? null,
  };
  let row: CommitmentRow | null = null;
  let error: { message?: string } | null = null;

  const primary = await c
    .from("commitments")
    .insert({
      ...basePayload,
      commitment_date: payload.date.slice(0, 10),
    })
    .select("*")
    .single();

  if (primary.error && isMissingColumn(primary.error, "commitment_date")) {
    const fallback = await c
      .from("commitments")
      .insert({
        ...basePayload,
        date: payload.date.slice(0, 10),
      })
      .select("*")
      .single();
    row = (fallback.data as CommitmentRow | null) ?? null;
    error = fallback.error;
  } else {
    row = (primary.data as CommitmentRow | null) ?? null;
    error = primary.error;
  }

  if (error || !row) throw new Error(error?.message ?? "Failed to create commitment.");
  const att = payload.attachments ?? [];
  for (const a of att) {
    await c.from("attachments").insert({
      entity_type: "commitment",
      entity_id: row.id,
      file_name: a.fileName,
      file_path: a.url,
      mime_type: a.mimeType,
      size_bytes: a.size,
    });
  }
  const attachments = await getAttachments(row.id);
  return toCommitment(row as CommitmentRow, attachments);
}

export async function updateCommitment(
  id: string,
  patch: Partial<Omit<Commitment, "id" | "projectId">> & { attachments?: ExpenseAttachment[] }
): Promise<boolean> {
  const c = client();
  const updates: Record<string, unknown> = {};
  if (patch.vendorName != null) updates.vendor_name = patch.vendorName;
  if (patch.type != null) updates.commitment_type = patch.type;
  if (patch.amount != null) updates.amount = Math.max(0, patch.amount);
  if (patch.status != null) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes ?? null;
  if (Object.keys(updates).length > 0) {
    const primaryUpdates = patch.date != null ? { ...updates, commitment_date: patch.date.slice(0, 10) } : updates;
    const { error } = await c.from("commitments").update(primaryUpdates).eq("id", id);
    if (error) {
      if (patch.date != null && isMissingColumn(error, "commitment_date")) {
        const fallbackUpdates = { ...updates, date: patch.date.slice(0, 10) };
        const { error: fallbackError } = await c.from("commitments").update(fallbackUpdates).eq("id", id);
        if (fallbackError) return false;
      } else {
        return false;
      }
    }
  }
  if (patch.attachments !== undefined) {
    await c.from("attachments").delete().eq("entity_type", "commitment").eq("entity_id", id);
    for (const a of patch.attachments) {
      await c.from("attachments").insert({
        entity_type: "commitment",
        entity_id: id,
        file_name: a.fileName,
        file_path: a.url,
        mime_type: a.mimeType,
        size_bytes: a.size,
      });
    }
  }
  return true;
}

export async function deleteCommitment(id: string): Promise<boolean> {
  const c = client();
  await c.from("attachments").delete().eq("entity_type", "commitment").eq("entity_id", id);
  const { error } = await c.from("commitments").delete().eq("id", id);
  return !error;
}

/** Open commitments by category for drilldown (materials / labor / vendor / other). */
export async function getCommittedCostByCategory(projectId: string): Promise<{ materials: number; labor: number; vendor: number; other: number }> {
  const list = await getCommitments(projectId);
  const out = { materials: 0, labor: 0, vendor: 0, other: 0 };
  const open = list.filter((c) => c.status === "Open");
  for (const c of open) {
    if (c.type === "PO") out.materials += c.amount;
    else if (c.type === "Subcontract") out.vendor += c.amount;
    else out.other += c.amount;
  }
  return out;
}
