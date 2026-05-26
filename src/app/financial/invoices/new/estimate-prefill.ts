import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseAdmin } from "@/lib/supabase-server";

type EstimateRow = {
  id: string;
  number: string | null;
  client: string | null;
  project: string | null;
  customer_id: string | null;
};

type EstimateMetaRow = {
  client_name: string | null;
  client_email: string | null;
  project_name: string | null;
};

type ScheduleRow = {
  id: string;
  estimate_id: string;
  title: string | null;
  description: string | null;
  amount: number | string | null;
  due_date: string | null;
  invoice_id: string | null;
};

type ProjectRow = {
  id: string;
  name: string | null;
  customer_id: string | null;
  client: string | null;
  client_name: string | null;
};

export type EstimateInvoicePrefill = {
  sourceEstimateId: string;
  paymentScheduleItemId: string;
  estimateNumber: string;
  projectId: string;
  projectName: string;
  customerId: string | null;
  customerName: string;
  dueDate: string;
  milestoneTitle: string;
  milestoneDescription: string;
  amount: number;
  notes: string;
};

export type EstimateInvoicePrefillResult =
  | { ok: true; prefill: EstimateInvoicePrefill }
  | { ok: false; error: string; existingInvoiceId?: string };

const PROJECT_LINK_ERROR =
  "Invoice generation requires a linked project. Convert this estimate to a project, or edit details so the project name matches one existing project before creating milestone invoices.";
const CUSTOMER_LINK_ERROR =
  "Cannot create invoice because customer link could not be resolved. Please link a customer first.";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueTexts(values: unknown[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function uniqueRowsById<T extends { id: string | null }>(rows: T[] | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows ?? []) {
    const id = cleanText(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function roundMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, n) * 100) / 100;
}

async function resolveProject(
  db: SupabaseClient,
  estimateId: string,
  estimate: EstimateRow,
  meta: EstimateMetaRow | null
): Promise<ProjectRow | null> {
  const bySource = await db
    .from("projects")
    .select("id, name, customer_id, client, client_name")
    .eq("source_estimate_id", estimateId);
  if (bySource.error) return null;
  const sourceMatches = uniqueRowsById((bySource.data ?? []) as ProjectRow[]);
  if (sourceMatches.length === 1) return sourceMatches[0];
  if (sourceMatches.length > 1) return null;

  const projectNames = uniqueTexts([meta?.project_name, estimate.project]);
  if (projectNames.length === 0) return null;
  const byName = await db
    .from("projects")
    .select("id, name, customer_id, client, client_name")
    .in("name", projectNames);
  if (byName.error) return null;
  const nameMatches = uniqueRowsById((byName.data ?? []) as ProjectRow[]);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

async function resolveCustomerId(
  db: SupabaseClient,
  estimate: EstimateRow,
  meta: EstimateMetaRow | null,
  project: ProjectRow
): Promise<string | null> {
  const projectCustomerId = cleanText(project.customer_id);
  if (projectCustomerId) return projectCustomerId;
  const estimateCustomerId = cleanText(estimate.customer_id);
  if (estimateCustomerId) return estimateCustomerId;

  const email = cleanText(meta?.client_email);
  if (email) {
    const byEmail = await db.from("customers").select("id").eq("email", email);
    if (!byEmail.error) {
      const emailMatches = uniqueRowsById((byEmail.data ?? []) as Array<{ id: string | null }>);
      if (emailMatches.length === 1) return cleanText(emailMatches[0].id);
    }
  }

  const customerNames = uniqueTexts([
    meta?.client_name,
    estimate.client,
    project.client_name,
    project.client,
  ]);
  if (customerNames.length === 0) return null;
  const [byName, byCompany] = await Promise.all([
    db.from("customers").select("id").in("name", customerNames),
    db.from("customers").select("id").in("company_name", customerNames),
  ]);
  if (byName.error || byCompany.error) return null;
  const matches = uniqueRowsById([
    ...((byName.data ?? []) as Array<{ id: string | null }>),
    ...((byCompany.data ?? []) as Array<{ id: string | null }>),
  ]);
  return matches.length === 1 ? cleanText(matches[0].id) : null;
}

export async function getEstimateInvoicePrefill(
  estimateId: string,
  paymentScheduleItemId: string
): Promise<EstimateInvoicePrefillResult> {
  const safeEstimateId = estimateId.trim();
  const safeItemId = paymentScheduleItemId.trim();
  if (!safeEstimateId || !safeItemId) return { ok: false, error: "Missing estimate milestone." };
  const db = getServerSupabaseAdmin();
  if (!db) return { ok: false, error: "Server database connection is not configured." };

  const [estimateRes, metaRes, scheduleRes] = await Promise.all([
    db
      .from("estimates")
      .select("id, number, client, project, customer_id")
      .eq("id", safeEstimateId)
      .maybeSingle(),
    db
      .from("estimate_meta")
      .select("client_name, client_email, project_name")
      .eq("estimate_id", safeEstimateId)
      .maybeSingle(),
    db
      .from("estimate_payment_schedule_items")
      .select("id, estimate_id, title, description, amount, due_date, invoice_id")
      .eq("id", safeItemId)
      .eq("estimate_id", safeEstimateId)
      .maybeSingle(),
  ]);

  if (estimateRes.error || !estimateRes.data) return { ok: false, error: "Estimate not found." };
  if (scheduleRes.error || !scheduleRes.data)
    return { ok: false, error: "Payment milestone not found." };

  const estimate = estimateRes.data as EstimateRow;
  const meta = (metaRes.data ?? null) as EstimateMetaRow | null;
  const schedule = scheduleRes.data as ScheduleRow;
  const existingInvoiceId = cleanText(schedule.invoice_id);
  if (existingInvoiceId) {
    return {
      ok: false,
      error: "This payment milestone already has an invoice.",
      existingInvoiceId,
    };
  }

  const project = await resolveProject(db, safeEstimateId, estimate, meta);
  if (!project?.id) return { ok: false, error: PROJECT_LINK_ERROR };

  const customerId = await resolveCustomerId(db, estimate, meta, project);
  if (!customerId) return { ok: false, error: CUSTOMER_LINK_ERROR };

  const milestoneTitle = cleanText(schedule.title) || "Payment milestone";
  const milestoneDescription = cleanText(schedule.description);
  const amount = roundMoney(schedule.amount);
  if (amount <= 0) return { ok: false, error: "Payment milestone amount must be greater than 0." };

  const estimateNumber = cleanText(estimate.number) || safeEstimateId;
  const customerName =
    cleanText(meta?.client_name) ||
    cleanText(estimate.client) ||
    cleanText(project.client_name) ||
    cleanText(project.client);

  return {
    ok: true,
    prefill: {
      sourceEstimateId: safeEstimateId,
      paymentScheduleItemId: safeItemId,
      estimateNumber,
      projectId: project.id,
      projectName:
        cleanText(project.name) || cleanText(meta?.project_name) || cleanText(estimate.project),
      customerId,
      customerName,
      dueDate: cleanText(schedule.due_date),
      milestoneTitle,
      milestoneDescription,
      amount,
      notes: `Generated from Estimate ${estimateNumber}, Payment Schedule ${milestoneTitle}.`,
    },
  };
}
