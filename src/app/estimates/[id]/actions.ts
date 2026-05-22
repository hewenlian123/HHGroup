"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateEstimatePaths } from "@/app/estimates/revalidate-estimate-paths";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  setEstimateStatusWithClient,
  addLineItemWithClient,
  updateLineItemWithClient,
  duplicateLineItemWithClient,
  deleteLineItemWithClient,
  createCustomEstimateCategoryWithClient,
  createEstimateCategoryWithExplicitCodeWithClient,
  addPaymentMilestoneWithClient,
  updatePaymentMilestoneWithClient,
  deletePaymentMilestoneWithClient,
  markPaymentMilestonePaidWithClient,
  reorderPaymentScheduleWithClient,
  updateEstimateMetaWithClient,
  updateEstimateStatusWithClient,
  reorderEstimateCategoriesWithClient,
  moveEstimateItemsToCostCodeWithClient,
  updateEstimateCategoryDisplayNameWithClient,
  type EstimateLineItemStatus,
} from "@/lib/estimates-db";
import { normalizeEstimateNoteBlocks } from "@/lib/estimate-notes";
import {
  createNewVersionFromSnapshot,
  convertEstimateSnapshotToProject,
  convertEstimateToProjectWithSetup,
  createPaymentTemplate,
  applyPaymentTemplateToEstimate,
} from "@/lib/data";

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

function getEstimateWriteClient(): SupabaseClient | null {
  return getServerSupabaseAdmin();
}

type ScheduleInvoiceActionResult = { ok: boolean; invoiceId?: string; error?: string };

type EstimateInvoiceSourceRow = {
  id: string;
  number: string | null;
  client: string | null;
  project: string | null;
  customer_id: string | null;
};

type EstimateInvoiceMetaRow = {
  client_name: string | null;
  client_email: string | null;
  project_name: string | null;
};

type EstimatePaymentScheduleSourceRow = {
  id: string;
  estimate_id: string;
  title: string | null;
  description: string | null;
  amount: number | string | null;
  due_date: string | null;
  status: string | null;
  invoice_id: string | null;
};

type ProjectInvoiceSourceRow = {
  id: string;
  name: string | null;
  customer_id: string | null;
  client: string | null;
  client_name: string | null;
};

const PROJECT_LINK_ERROR =
  "Cannot create invoice because project link could not be resolved. Please link a project first.";
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

function isUniqueInvoiceNoError(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "23505" || /invoice_no|invoices_invoice_no_key/i.test(message);
}

function isQuantityColumnUnsupported(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /quantity/i.test(message) && /column|generated|schema cache|could not find/i.test(message);
}

async function deleteDraftInvoiceGraph(c: SupabaseClient, invoiceId: string): Promise<void> {
  await c.from("invoice_items").delete().eq("invoice_id", invoiceId);
  await c.from("invoices").delete().eq("id", invoiceId);
}

async function resolveProjectForScheduleInvoice(
  c: SupabaseClient,
  estimateId: string,
  estimate: EstimateInvoiceSourceRow,
  meta: EstimateInvoiceMetaRow | null
): Promise<ProjectInvoiceSourceRow> {
  const bySource = await c
    .from("projects")
    .select("id, name, customer_id, client, client_name")
    .eq("source_estimate_id", estimateId);
  if (bySource.error) throw new Error(bySource.error.message);
  const sourceMatches = uniqueRowsById((bySource.data ?? []) as ProjectInvoiceSourceRow[]);
  if (sourceMatches.length === 1) return sourceMatches[0];
  if (sourceMatches.length > 1) throw new Error(PROJECT_LINK_ERROR);

  const projectNames = uniqueTexts([meta?.project_name, estimate.project]);
  if (projectNames.length === 0) throw new Error(PROJECT_LINK_ERROR);

  const byName = await c
    .from("projects")
    .select("id, name, customer_id, client, client_name")
    .in("name", projectNames);
  if (byName.error) throw new Error(byName.error.message);
  const nameMatches = uniqueRowsById((byName.data ?? []) as ProjectInvoiceSourceRow[]);
  if (nameMatches.length !== 1) throw new Error(PROJECT_LINK_ERROR);
  return nameMatches[0];
}

async function resolveCustomerIdForScheduleInvoice(
  c: SupabaseClient,
  estimate: EstimateInvoiceSourceRow,
  meta: EstimateInvoiceMetaRow | null,
  project: ProjectInvoiceSourceRow
): Promise<string> {
  const projectCustomerId = cleanText(project.customer_id);
  if (projectCustomerId) return projectCustomerId;

  const estimateCustomerId = cleanText(estimate.customer_id);
  if (estimateCustomerId) return estimateCustomerId;

  const email = cleanText(meta?.client_email);
  if (email) {
    const byEmail = await c.from("customers").select("id").eq("email", email);
    if (byEmail.error) throw new Error(byEmail.error.message);
    const emailMatches = uniqueRowsById((byEmail.data ?? []) as Array<{ id: string | null }>);
    if (emailMatches.length === 1) return cleanText(emailMatches[0].id);
    if (emailMatches.length > 1) throw new Error(CUSTOMER_LINK_ERROR);
  }

  const customerNames = uniqueTexts([
    meta?.client_name,
    estimate.client,
    project.client_name,
    project.client,
  ]);
  if (customerNames.length === 0) throw new Error(CUSTOMER_LINK_ERROR);

  const [byName, byCompany] = await Promise.all([
    c.from("customers").select("id").in("name", customerNames),
    c.from("customers").select("id").in("company_name", customerNames),
  ]);
  if (byName.error) throw new Error(byName.error.message);
  if (byCompany.error) throw new Error(byCompany.error.message);
  const matches = uniqueRowsById([
    ...((byName.data ?? []) as Array<{ id: string | null }>),
    ...((byCompany.data ?? []) as Array<{ id: string | null }>),
  ]);
  if (matches.length !== 1) throw new Error(CUSTOMER_LINK_ERROR);
  return cleanText(matches[0].id);
}

async function nextInvoiceNo(c: SupabaseClient, attempt: number): Promise<string> {
  const { count } = await c.from("invoices").select("id", { count: "exact", head: true });
  return `INV-${String((count ?? 0) + 1 + attempt).padStart(4, "0")}`;
}

async function insertScheduleInvoice(
  c: SupabaseClient,
  payload: {
    projectId: string;
    customerId: string;
    clientName: string;
    title: string;
    notes: string;
    issueDate: string;
    dueDate: string;
    amount: number;
  }
): Promise<string> {
  let lastError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoiceNo = await nextInvoiceNo(c, attempt);
    const { data, error } = await c
      .from("invoices")
      .insert({
        invoice_no: invoiceNo,
        project_id: payload.projectId,
        customer_id: payload.customerId,
        client_name: payload.clientName,
        issue_date: payload.issueDate,
        due_date: payload.dueDate,
        status: "Draft",
        notes: payload.notes,
        tax_pct: 0,
        subtotal: payload.amount,
        tax_amount: 0,
        total: payload.amount,
      })
      .select("id")
      .single();
    if (!error && data?.id) return String(data.id);
    lastError = error;
    if (!isUniqueInvoiceNoError(error)) break;
  }
  throw new Error(lastError?.message ?? "Failed to create invoice.");
}

async function insertScheduleInvoiceLine(
  c: SupabaseClient,
  invoiceId: string,
  description: string,
  amount: number
): Promise<void> {
  const row = {
    invoice_id: invoiceId,
    description,
    qty: 1,
    quantity: 1,
    unit_price: amount,
    amount,
  };
  let { error } = await c.from("invoice_items").insert(row);
  if (error && isQuantityColumnUnsupported(error)) {
    const fallback = await c.from("invoice_items").insert({
      invoice_id: row.invoice_id,
      description: row.description,
      qty: row.qty,
      unit_price: row.unit_price,
      amount: row.amount,
    });
    error = fallback.error;
  }
  if (error) throw new Error(error.message ?? "Failed to create invoice line item.");
}

export async function approveEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await setEstimateStatusWithClient(estimateId, "Approved", db);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function createNewVersionAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const ok = await createNewVersionFromSnapshot(estimateId);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function convertToProjectAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const record = await convertEstimateSnapshotToProject(estimateId);
    if (!record) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    revalidatePath("/projects");
    redirect(`/projects/${record.projectId}`);
  } catch {
    // no-op
  }
}

export async function sendEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await setEstimateStatusWithClient(estimateId, "Sent", db);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function rejectEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await setEstimateStatusWithClient(estimateId, "Rejected", db);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function changeEstimateStatusAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const newStatus = formData.get("newStatus");
  const valid = ["Draft", "Sent", "Approved", "Rejected", "Converted"];
  if (typeof estimateId !== "string" || typeof newStatus !== "string" || !valid.includes(newStatus))
    return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await updateEstimateStatusWithClient(
      db,
      estimateId,
      newStatus as "Draft" | "Sent" | "Approved" | "Rejected" | "Converted"
    );
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

// ---- Inline UI actions (no redirect) ----

export async function changeEstimateStatusInlineAction(
  estimateId: string,
  newStatus: EstimateStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await updateEstimateStatusWithClient(db, estimateId, newStatus);
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function sendEstimateInlineAction(
  estimateId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await setEstimateStatusWithClient(estimateId, "Sent", db);
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function approveEstimateInlineAction(
  estimateId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await setEstimateStatusWithClient(estimateId, "Approved", db);
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function rejectEstimateInlineAction(
  estimateId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await setEstimateStatusWithClient(estimateId, "Rejected", db);
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function convertToProjectInlineAction(
  estimateId: string
): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  try {
    const record = await convertEstimateSnapshotToProject(estimateId);
    if (record) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
      revalidatePath("/projects");
      return { ok: true, projectId: record.projectId };
    }
    return { ok: false, error: "已转换或报价未批准" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

/** Convert with setup form payload. Returns { ok, projectId } on success so client can redirect; does not redirect. */
export async function convertToProjectWithSetupAction(
  formData: FormData
): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return { ok: false, error: "Missing estimate" };
  try {
    const record = await convertEstimateToProjectWithSetup(estimateId, {
      projectName: (formData.get("projectName") as string)?.trim() ?? "",
      client: (formData.get("client") as string)?.trim() || undefined,
      address: (formData.get("address") as string)?.trim() || undefined,
      projectManager: (formData.get("projectManager") as string)?.trim() || undefined,
      startDate: (formData.get("startDate") as string)?.trim() || undefined,
      endDate: (formData.get("endDate") as string)?.trim() || undefined,
      notes: (formData.get("notes") as string)?.trim() || undefined,
      estimateRef: (formData.get("estimateRef") as string)?.trim() || undefined,
    });
    if (record) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
      revalidatePath("/projects");
      return { ok: true, projectId: record.projectId };
    }
    return { ok: false, error: "Already converted or estimate not approved" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Conversion failed" };
  }
}

export async function saveEstimateMetaInlineAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return { ok: false, error: "缺少报价 ID" };
  try {
    const clientName = (formData.get("clientName") as string)?.trim();
    const projectName = (formData.get("projectName") as string)?.trim();
    const address = (formData.get("address") as string)?.trim();
    const tax = formData.get("tax");
    const discount = formData.get("discount");
    const estimateDate = (formData.get("estimateDate") as string)?.trim();
    const validUntil = (formData.get("validUntil") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();
    const salesPerson = (formData.get("salesPerson") as string)?.trim();
    if (formData.has("clientName") && !clientName) {
      return { ok: false, error: "Client name is required." };
    }
    if (formData.has("projectName") && !projectName) {
      return { ok: false, error: "Project name is required." };
    }
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await updateEstimateMetaWithClient(db, estimateId, {
      ...(clientName != null
        ? { client: { name: clientName, ...(address != null ? { address } : {}) } }
        : {}),
      ...(projectName != null
        ? { project: { name: projectName, ...(address != null ? { siteAddress: address } : {}) } }
        : {}),
      ...(address != null && clientName == null && projectName == null
        ? { client: { address }, project: { siteAddress: address } }
        : {}),
      ...(tax != null && tax !== "" ? { tax: Number(tax) || 0 } : {}),
      ...(discount != null && discount !== "" ? { discount: Number(discount) || 0 } : {}),
      ...(estimateDate != null ? { estimateDate: estimateDate || undefined } : {}),
      ...(validUntil != null ? { validUntil: validUntil || undefined } : {}),
      ...(notes != null ? { notes: notes || undefined } : {}),
      ...(salesPerson != null ? { salesPerson: salesPerson || undefined } : {}),
    });
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function addPaymentMilestoneAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  const title = (formData.get("title") as string)?.trim() || "Payment";
  const description = (formData.get("description") as string)?.trim() || "";
  const amount = Number(formData.get("amount")) || 0;
  const dueDateRaw = (formData.get("dueDate") as string)?.trim() || "";
  const dueDate = dueDateRaw || undefined;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await addPaymentMilestoneWithClient(db, estimateId, { title, description, amount, dueDate });
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function updatePaymentMilestoneAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const amount = formData.get("amount");
  const dueDateRaw = (formData.get("dueDate") as string)?.trim() || "";
  const dueDate = dueDateRaw || null;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await updatePaymentMilestoneWithClient(db, estimateId, itemId, {
      ...(title != null ? { title } : {}),
      ...(description != null ? { description } : {}),
      ...(amount != null && amount !== "" ? { amount: Number(amount) } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
    });
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function deletePaymentMilestoneAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await deletePaymentMilestoneWithClient(db, estimateId, itemId);
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function markPaymentMilestonePaidAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await markPaymentMilestonePaidWithClient(db, estimateId, itemId);
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function createInvoiceFromPaymentScheduleItemAction(
  estimateId: string,
  scheduleItemId: string
): Promise<ScheduleInvoiceActionResult> {
  const safeEstimateId = estimateId.trim();
  const safeScheduleItemId = scheduleItemId.trim();
  if (!safeEstimateId || !safeScheduleItemId) {
    return { ok: false, error: "Missing estimate or payment schedule item." };
  }

  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };

    const [estimateRes, metaRes, itemRes] = await Promise.all([
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
        .select("id, estimate_id, title, description, amount, due_date, status, invoice_id")
        .eq("id", safeScheduleItemId)
        .eq("estimate_id", safeEstimateId)
        .maybeSingle(),
    ]);

    if (estimateRes.error) return { ok: false, error: estimateRes.error.message };
    if (metaRes.error) return { ok: false, error: metaRes.error.message };
    if (itemRes.error) return { ok: false, error: itemRes.error.message };
    if (!estimateRes.data) return { ok: false, error: "Estimate not found." };
    if (!itemRes.data) return { ok: false, error: "Payment schedule item not found." };

    const estimate = estimateRes.data as EstimateInvoiceSourceRow;
    const meta = (metaRes.data ?? null) as EstimateInvoiceMetaRow | null;
    const item = itemRes.data as EstimatePaymentScheduleSourceRow;
    const existingInvoiceId = cleanText(item.invoice_id);
    if (existingInvoiceId) {
      revalidateEstimatePaths(safeEstimateId);
      revalidatePath(`/financial/invoices/${existingInvoiceId}`);
      return { ok: true, invoiceId: existingInvoiceId };
    }

    const project = await resolveProjectForScheduleInvoice(db, safeEstimateId, estimate, meta);
    const projectId = cleanText(project.id);
    if (!projectId) return { ok: false, error: PROJECT_LINK_ERROR };

    const customerId = await resolveCustomerIdForScheduleInvoice(db, estimate, meta, project);
    if (!customerId) return { ok: false, error: CUSTOMER_LINK_ERROR };

    const amount = roundMoney(item.amount);
    if (amount <= 0) return { ok: false, error: "Payment schedule amount must be greater than 0." };

    const scheduleTitle = cleanText(item.title) || "Payment";
    const estimateNumber = cleanText(estimate.number) || safeEstimateId;
    const clientName =
      cleanText(meta?.client_name) ||
      cleanText(estimate.client) ||
      cleanText(project.client_name) ||
      cleanText(project.client);
    if (!clientName) return { ok: false, error: CUSTOMER_LINK_ERROR };

    const today = new Date().toISOString().slice(0, 10);
    const invoiceTitle = `Payment Schedule - ${scheduleTitle}`;
    const notes = `Generated from Estimate ${estimateNumber}, Payment Schedule ${scheduleTitle}.`;
    const invoiceId = await insertScheduleInvoice(db, {
      projectId,
      customerId,
      clientName,
      title: invoiceTitle,
      notes,
      issueDate: today,
      dueDate: cleanText(item.due_date) || today,
      amount,
    });

    try {
      await insertScheduleInvoiceLine(db, invoiceId, invoiceTitle, amount);
      const { data: linked, error: linkError } = await db
        .from("estimate_payment_schedule_items")
        .update({ invoice_id: invoiceId, status: "invoiced" })
        .eq("id", safeScheduleItemId)
        .eq("estimate_id", safeEstimateId)
        .is("invoice_id", null)
        .select("id, invoice_id")
        .maybeSingle();
      if (linkError) throw new Error(linkError.message);
      if (!linked?.invoice_id) {
        const { data: current } = await db
          .from("estimate_payment_schedule_items")
          .select("invoice_id")
          .eq("id", safeScheduleItemId)
          .eq("estimate_id", safeEstimateId)
          .maybeSingle();
        await deleteDraftInvoiceGraph(db, invoiceId);
        const concurrentInvoiceId = cleanText(
          (current as { invoice_id?: string | null } | null)?.invoice_id
        );
        if (concurrentInvoiceId) {
          revalidateEstimatePaths(safeEstimateId);
          revalidatePath(`/financial/invoices/${concurrentInvoiceId}`);
          return { ok: true, invoiceId: concurrentInvoiceId };
        }
        return { ok: false, error: "Could not link invoice to payment schedule." };
      }
    } catch (error) {
      await deleteDraftInvoiceGraph(db, invoiceId);
      throw error;
    }

    revalidateEstimatePaths(safeEstimateId);
    revalidatePath("/estimates");
    revalidatePath("/financial/invoices");
    revalidatePath(`/financial/invoices/${invoiceId}`);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/owner");

    return { ok: true, invoiceId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function createInvoiceFromPaymentScheduleItemFormAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  const result = await createInvoiceFromPaymentScheduleItemAction(estimateId, itemId);
  if (result.ok && result.invoiceId) {
    redirect(`/financial/invoices/${result.invoiceId}`);
  }
  const error = encodeURIComponent(result.error ?? "Could not create invoice.");
  revalidateEstimatePaths(estimateId);
  redirect(`/estimates/${estimateId}?invoiceError=${error}`);
}

export async function reorderPaymentScheduleAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const orderedIdsJson = formData.get("orderedItemIds");
  if (typeof estimateId !== "string" || typeof orderedIdsJson !== "string") return;
  try {
    const orderedItemIds = JSON.parse(orderedIdsJson) as string[];
    if (!Array.isArray(orderedItemIds) || orderedItemIds.length === 0) return;
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await reorderPaymentScheduleWithClient(db, estimateId, orderedItemIds);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function applyPaymentTemplateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const templateId = formData.get("templateId");
  if (typeof estimateId !== "string" || typeof templateId !== "string") return;
  try {
    const ok = await applyPaymentTemplateToEstimate(estimateId, templateId);
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function createPaymentTemplateAction(formData: FormData) {
  const name = (formData.get("templateName") as string)?.trim() || "Payment template";
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const { getPaymentSchedule } = await import("@/lib/data");
    const schedule = await getPaymentSchedule(estimateId);
    if (schedule.length === 0) return;
    const items = schedule.map((m) => ({
      title: m.title,
      amountType: "fixed" as const,
      value: m.amount,
      dueRule: m.description ?? "",
    }));
    const template = await createPaymentTemplate(name, items);
    if (!template) return;
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function addLineItemAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const costCode = formData.get("costCode");
  if (typeof estimateId !== "string" || typeof costCode !== "string") return;
  const categoryDisplayName = (formData.get("categoryDisplayName") as string)?.trim() || "";
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const item = await addLineItemWithClient(db, estimateId, {
      costCode,
      desc: (formData.get("desc") as string)?.trim() || "New item",
      qty: Number(formData.get("qty")) || 1,
      unit: (formData.get("unit") as string)?.trim() || "EA",
      unitCost: Number(formData.get("unitCost")) || 0,
      markupPct: 0,
    });
    if (!item) return;
    if (categoryDisplayName) {
      await updateEstimateMetaWithClient(db, estimateId, {
        categoryNames: { [costCode]: categoryDisplayName },
      });
    }
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

/** Add first line for a catalog cost code from the Cost Breakdown UI — no full-page redirect. */
export async function addLineItemCatalogInlineAction(
  estimateId: string,
  costCode: string,
  categoryDisplayName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const item = await addLineItemWithClient(db, estimateId, {
      costCode,
      desc: "New item",
      qty: 1,
      unit: "EA",
      unitCost: 0,
      markupPct: 0,
    });
    if (!item) return { ok: false, error: "Could not add line item." };
    if (categoryDisplayName.trim()) {
      await updateEstimateMetaWithClient(db, estimateId, {
        categoryNames: { [costCode]: categoryDisplayName.trim() },
      });
    }
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add line item." };
  }
}

export async function createCustomEstimateCategoryAction(
  estimateId: string,
  displayName: string
): Promise<{ ok: boolean; costCode?: string; error?: string }> {
  if (!estimateId.trim()) return { ok: false, error: "Estimate id is required." };
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const out = await createCustomEstimateCategoryWithClient(db, estimateId, displayName);
    if (!out.ok) return { ok: false, error: out.error };
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true, costCode: out.costCode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create section." };
  }
}

export async function createEstimateCategoryWithCodeAction(
  estimateId: string,
  costCode: string,
  displayName: string
): Promise<{ ok: boolean; costCode?: string; error?: string }> {
  if (!estimateId.trim()) return { ok: false, error: "Estimate id is required." };
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const out = await createEstimateCategoryWithExplicitCodeWithClient(
      db,
      estimateId,
      costCode,
      displayName
    );
    if (!out.ok) return { ok: false, error: out.error };
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true, costCode: out.costCode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create section." };
  }
}

export async function toggleLineItemHideAmountOnPdfAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  const hideRaw = formData.get("hideAmountOnPdf");
  if (typeof estimateId !== "string" || typeof itemId !== "string") {
    return { ok: false, error: "Missing estimate or item id" };
  }
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const hideAmountOnPdf = hideRaw === "1" || hideRaw === "true";
    const ok = await updateLineItemWithClient(db, estimateId, itemId, { hideAmountOnPdf });
    if (!ok) return { ok: false, error: "Could not update line item." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update line item." };
  }
}

export async function setLineItemStatusAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  const status = formData.get("status");
  if (typeof estimateId !== "string" || typeof itemId !== "string" || typeof status !== "string") {
    return { ok: false, error: "Missing estimate, item, or status" };
  }
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await updateLineItemWithClient(db, estimateId, itemId, {
      status: status as EstimateLineItemStatus,
    });
    if (!ok) return { ok: false, error: "Could not update line item status." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update line item status.",
    };
  }
}

export async function saveEstimateDocumentNotesInlineAction(
  estimateId: string,
  notes: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (!estimateId.trim()) return { ok: false, error: "Missing estimate id" };
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await updateEstimateMetaWithClient(db, estimateId, {
      documentNotes: normalizeEstimateNoteBlocks(notes),
    });
    if (!ok) return { ok: false, error: "Could not save notes." };
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save notes." };
  }
}

export async function updateLineItemAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  try {
    const desc = formData.get("desc") as string | null;
    const qty = formData.get("qty");
    const unit = formData.get("unit") as string | null;
    const unitCost = formData.get("unitCost");
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await updateLineItemWithClient(db, estimateId, itemId, {
      ...(desc != null ? { desc } : {}),
      ...(qty != null && qty !== "" ? { qty: Number(qty) } : {}),
      ...(unit != null ? { unit } : {}),
      ...(unitCost != null && unitCost !== "" ? { unitCost: Number(unitCost) } : {}),
    });
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

/** Same payload as update line item form, without redirect — for client-driven saves (e.g. description modal). */
export async function updateLineItemInlineAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string")
    return { ok: false, error: "Missing estimate or item id" };
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const desc = formData.get("desc") as string | null;
    const qty = formData.get("qty");
    const unit = formData.get("unit") as string | null;
    const unitCost = formData.get("unitCost");
    const ok = await updateLineItemWithClient(db, estimateId, itemId, {
      ...(desc != null ? { desc } : {}),
      ...(qty != null && qty !== "" ? { qty: Number(qty) } : {}),
      ...(unit != null ? { unit } : {}),
      ...(unitCost != null && unitCost !== "" ? { unitCost: Number(unitCost) } : {}),
    });
    if (ok) {
      revalidateEstimatePaths(estimateId);
      return { ok: true };
    }
    return { ok: false, error: "Could not update line item" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function duplicateLineItemAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    const item = await duplicateLineItemWithClient(db, estimateId, itemId);
    if (!item) return;
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function deleteLineItemAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await deleteLineItemWithClient(db, estimateId, itemId);
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function saveEstimateMetaAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const clientName = (formData.get("clientName") as string)?.trim();
    const projectName = (formData.get("projectName") as string)?.trim();
    const address = (formData.get("address") as string)?.trim();
    const tax = formData.get("tax");
    const discount = formData.get("discount");
    const estimateDate = (formData.get("estimateDate") as string)?.trim();
    const validUntil = (formData.get("validUntil") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();
    const salesPerson = (formData.get("salesPerson") as string)?.trim();
    const db = getEstimateWriteClient();
    if (!db) return;
    const ok = await updateEstimateMetaWithClient(db, estimateId, {
      ...(clientName != null
        ? { client: { name: clientName, ...(address != null ? { address } : {}) } }
        : {}),
      ...(projectName != null
        ? { project: { name: projectName, ...(address != null ? { siteAddress: address } : {}) } }
        : {}),
      ...(address != null && clientName == null && projectName == null
        ? { client: { address }, project: { siteAddress: address } }
        : {}),
      ...(tax != null && tax !== "" ? { tax: Number(tax) || 0 } : {}),
      ...(discount != null && discount !== "" ? { discount: Number(discount) || 0 } : {}),
      ...(estimateDate != null ? { estimateDate: estimateDate || undefined } : {}),
      ...(validUntil != null ? { validUntil: validUntil || undefined } : {}),
      ...(notes != null ? { notes: notes || undefined } : {}),
      ...(salesPerson != null ? { salesPerson: salesPerson || undefined } : {}),
    });
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(ok ? `/estimates/${estimateId}?saved=1` : `/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function saveCostCategoryNameAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const costCode = formData.get("costCode");
  const displayName = (formData.get("displayName") as string)?.trim();
  if (typeof estimateId !== "string" || typeof costCode !== "string" || displayName == null) return;
  try {
    const db = getEstimateWriteClient();
    if (!db) return;
    await updateEstimateMetaWithClient(db, estimateId, {
      categoryNames: { [costCode]: displayName },
    });
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

export async function reorderEstimateCategoriesAction(
  estimateId: string,
  orderedCostCodes: string[],
  displayNamesByCode: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (orderedCostCodes.length === 0) return { ok: true };
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await reorderEstimateCategoriesWithClient(
      db,
      estimateId,
      orderedCostCodes,
      displayNamesByCode
    );
    if (!ok) return { ok: false, error: "Could not save section order." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save section order." };
  }
}

export async function moveEstimateItemsToCostCodeAction(
  estimateId: string,
  itemIds: string[],
  newCostCode: string,
  displayNameHint?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (itemIds.length === 0) return { ok: true };
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await moveEstimateItemsToCostCodeWithClient(
      db,
      estimateId,
      itemIds,
      newCostCode,
      displayNameHint
    );
    if (!ok) return { ok: false, error: "Could not move items to this section." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not move items to this section." };
  }
}

/** Inline rename: no redirect; use from client after click-to-edit. */
export async function saveCostCategoryNameInlineAction(
  estimateId: string,
  costCode: string,
  displayName: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  try {
    const db = getEstimateWriteClient();
    if (!db) return { ok: false, error: "Database is not configured." };
    const ok = await updateEstimateCategoryDisplayNameWithClient(db, estimateId, costCode, trimmed);
    if (!ok) {
      // Fallback: legacy path in case direct category upsert fails in some environments.
      const legacyOk = await updateEstimateMetaWithClient(db, estimateId, {
        categoryNames: { [costCode]: trimmed },
      });
      if (!legacyOk) return { ok: false, error: "Could not save section name." };
    }
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save section name." };
  }
}
