"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateEstimatePaths } from "@/app/estimates/revalidate-estimate-paths";
import { createNewVersionFromSnapshot, convertEstimateSnapshotToProject, convertEstimateToProjectWithSetup, addLineItem, createCustomEstimateCategory, createEstimateCategoryWithExplicitCode, updateEstimateCategoryDisplayName, setEstimateStatus, updateEstimateStatus, updateEstimateMeta, updateLineItem, duplicateLineItem, deleteLineItem, moveEstimateItemsToCostCode, reorderEstimateCategories, addPaymentMilestone, updatePaymentMilestone, deletePaymentMilestone, markPaymentMilestonePaid, reorderPaymentSchedule, createPaymentTemplate, applyPaymentTemplateToEstimate } from "@/lib/data";

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

export async function approveEstimateAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return;
  try {
    const ok = await setEstimateStatus(estimateId, "Approved");
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
    const ok = await setEstimateStatus(estimateId, "Sent");
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
    const ok = await setEstimateStatus(estimateId, "Rejected");
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
  if (typeof estimateId !== "string" || typeof newStatus !== "string" || !valid.includes(newStatus)) return;
  try {
    const ok = await updateEstimateStatus(estimateId, newStatus as "Draft" | "Sent" | "Approved" | "Rejected" | "Converted");
    if (!ok) return;
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

// ---- Inline UI actions (no redirect) ----

export async function changeEstimateStatusInlineAction(estimateId: string, newStatus: EstimateStatus): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await updateEstimateStatus(estimateId, newStatus);
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function sendEstimateInlineAction(estimateId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await setEstimateStatus(estimateId, "Sent");
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function approveEstimateInlineAction(estimateId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await setEstimateStatus(estimateId, "Approved");
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function rejectEstimateInlineAction(estimateId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await setEstimateStatus(estimateId, "Rejected");
    if (ok) {
      revalidateEstimatePaths(estimateId);
      revalidatePath("/estimates");
    }
    return { ok: Boolean(ok) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export async function convertToProjectInlineAction(estimateId: string): Promise<{ ok: boolean; projectId?: string; error?: string }> {
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
export async function convertToProjectWithSetupAction(formData: FormData): Promise<{ ok: boolean; projectId?: string; error?: string }> {
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

export async function saveEstimateMetaInlineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string") return { ok: false, error: "缺少报价 ID" };
  try {
    const clientName = (formData.get("clientName") as string)?.trim();
    const projectName = (formData.get("projectName") as string)?.trim();
    const address = (formData.get("address") as string)?.trim();
    const tax = formData.get("tax");
    const discount = formData.get("discount");
    const markupPct = formData.get("markupPct");
    const estimateDate = (formData.get("estimateDate") as string)?.trim();
    const validUntil = (formData.get("validUntil") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();
    const salesPerson = (formData.get("salesPerson") as string)?.trim();
    const markupNum = markupPct != null && markupPct !== "" ? Number(markupPct) / 100 : undefined;
    const ok = await updateEstimateMeta(estimateId, {
      ...(clientName != null ? { client: { name: clientName, ...(address != null ? { address } : {}) } } : {}),
      ...(projectName != null ? { project: { name: projectName, ...(address != null ? { siteAddress: address } : {}) } } : {}),
      ...(address != null && clientName == null && projectName == null ? { client: { address }, project: { siteAddress: address } } : {}),
      ...(tax != null && tax !== "" ? { tax: Number(tax) || 0 } : {}),
      ...(discount != null && discount !== "" ? { discount: Number(discount) || 0 } : {}),
      ...(markupNum != null && !Number.isNaN(markupNum) ? { overheadPct: markupNum / 2, profitPct: markupNum / 2 } : {}),
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
  const amountType = formData.get("amountType") === "fixed" ? "fixed" : "percent";
  const value = Number(formData.get("value")) || 0;
  const dueRule = (formData.get("dueRule") as string)?.trim() || "";
  const dueDateRaw = (formData.get("dueDate") as string)?.trim() || "";
  const dueDate = dueDateRaw || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  try {
    await addPaymentMilestone(estimateId, { title, amountType, value, dueRule, dueDate, notes });
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
  const amountType = formData.get("amountType") as string | null;
  const value = formData.get("value");
  const dueRule = (formData.get("dueRule") as string)?.trim();
  const dueDateRaw = (formData.get("dueDate") as string)?.trim() || "";
  const dueDate = dueDateRaw || null;
  const notes = (formData.get("notes") as string)?.trim();
  try {
    await updatePaymentMilestone(estimateId, itemId, {
      ...(title != null ? { title } : {}),
      ...(amountType === "percent" || amountType === "fixed" ? { amountType: amountType as "percent" | "fixed" } : {}),
      ...(value != null && value !== "" ? { value: Number(value) } : {}),
      ...(dueRule != null ? { dueRule } : {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
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
    await deletePaymentMilestone(estimateId, itemId);
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
    await markPaymentMilestonePaid(estimateId, itemId);
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  }
}

export async function reorderPaymentScheduleAction(formData: FormData) {
  const estimateId = formData.get("estimateId");
  const orderedIdsJson = formData.get("orderedItemIds");
  if (typeof estimateId !== "string" || typeof orderedIdsJson !== "string") return;
  try {
    const orderedItemIds = JSON.parse(orderedIdsJson) as string[];
    if (!Array.isArray(orderedItemIds) || orderedItemIds.length === 0) return;
    const ok = await reorderPaymentSchedule(estimateId, orderedItemIds);
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
      amountType: m.amountType,
      value: m.value,
      dueRule: m.dueRule,
      notes: m.notes ?? undefined,
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
    const item = await addLineItem(estimateId, {
      costCode,
      desc: (formData.get("desc") as string)?.trim() || "New item",
      qty: Number(formData.get("qty")) || 1,
      unit: (formData.get("unit") as string)?.trim() || "EA",
      unitCost: Number(formData.get("unitCost")) || 0,
      markupPct: Number(formData.get("markupPct")) || 0.1,
    });
    if (!item) return;
    if (categoryDisplayName) {
      await updateEstimateMeta(estimateId, { costCategoryNames: { [costCode]: categoryDisplayName } });
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
    const item = await addLineItem(estimateId, {
      costCode,
      desc: "New item",
      qty: 1,
      unit: "EA",
      unitCost: 0,
      markupPct: 0.1,
    });
    if (!item) return { ok: false, error: "Could not add line item." };
    if (categoryDisplayName.trim()) {
      await updateEstimateMeta(estimateId, { costCategoryNames: { [costCode]: categoryDisplayName.trim() } });
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
    const out = await createCustomEstimateCategory(estimateId, displayName);
    if (!out.ok) return { ok: false, error: out.error };
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true, costCode: out.costCode };
  } catch (e) {
    console.error(e);
    console.log(e instanceof Error ? e.message : "Could not create category.");
    console.log((e as { details?: unknown })?.details);
    return { ok: false, error: e instanceof Error ? e.message : "Could not create category." };
  }
}

export async function createEstimateCategoryWithCodeAction(
  estimateId: string,
  costCode: string,
  displayName: string
): Promise<{ ok: boolean; costCode?: string; error?: string }> {
  if (!estimateId.trim()) return { ok: false, error: "Estimate id is required." };
  try {
    const out = await createEstimateCategoryWithExplicitCode(estimateId, costCode, displayName);
    if (!out.ok) return { ok: false, error: out.error };
    revalidateEstimatePaths(estimateId);
    revalidatePath("/estimates");
    return { ok: true, costCode: out.costCode };
  } catch (e) {
    console.error(e);
    console.log(e instanceof Error ? e.message : "Could not create category.");
    console.log((e as { details?: unknown })?.details);
    return { ok: false, error: e instanceof Error ? e.message : "Could not create category." };
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
    const markupPct = formData.get("markupPct");
    await updateLineItem(estimateId, itemId, {
      ...(desc != null ? { desc } : {}),
      ...(qty != null && qty !== "" ? { qty: Number(qty) } : {}),
      ...(unit != null ? { unit } : {}),
      ...(unitCost != null && unitCost !== "" ? { unitCost: Number(unitCost) } : {}),
      ...(markupPct != null && markupPct !== "" ? { markupPct: Number(markupPct) / 100 } : {}),
    });
    revalidateEstimatePaths(estimateId);
    redirect(`/estimates/${estimateId}`);
  } catch {
    // no-op
  }
}

/** Same payload as update line item form, without redirect — for client-driven saves (e.g. description modal). */
export async function updateLineItemInlineAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const estimateId = formData.get("estimateId");
  const itemId = formData.get("itemId");
  if (typeof estimateId !== "string" || typeof itemId !== "string") return { ok: false, error: "Missing estimate or item id" };
  try {
    const desc = formData.get("desc") as string | null;
    const qty = formData.get("qty");
    const unit = formData.get("unit") as string | null;
    const unitCost = formData.get("unitCost");
    const markupPct = formData.get("markupPct");
    const ok = await updateLineItem(estimateId, itemId, {
      ...(desc != null ? { desc } : {}),
      ...(qty != null && qty !== "" ? { qty: Number(qty) } : {}),
      ...(unit != null ? { unit } : {}),
      ...(unitCost != null && unitCost !== "" ? { unitCost: Number(unitCost) } : {}),
      ...(markupPct != null && markupPct !== "" ? { markupPct: Number(markupPct) / 100 } : {}),
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
    const item = await duplicateLineItem(estimateId, itemId);
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
    await deleteLineItem(estimateId, itemId);
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
    const markupPct = formData.get("markupPct");
    const estimateDate = (formData.get("estimateDate") as string)?.trim();
    const validUntil = (formData.get("validUntil") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();
    const salesPerson = (formData.get("salesPerson") as string)?.trim();
    const markupNum = markupPct != null && markupPct !== "" ? Number(markupPct) / 100 : undefined;
    const ok = await updateEstimateMeta(estimateId, {
      ...(clientName != null ? { client: { name: clientName, ...(address != null ? { address } : {}) } } : {}),
      ...(projectName != null ? { project: { name: projectName, ...(address != null ? { siteAddress: address } : {}) } } : {}),
      ...(address != null && clientName == null && projectName == null ? { client: { address }, project: { siteAddress: address } } : {}),
      ...(tax != null && tax !== "" ? { tax: Number(tax) || 0 } : {}),
      ...(discount != null && discount !== "" ? { discount: Number(discount) || 0 } : {}),
      ...(markupNum != null && !Number.isNaN(markupNum) ? { overheadPct: markupNum / 2, profitPct: markupNum / 2 } : {}),
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
    await updateEstimateMeta(estimateId, { costCategoryNames: { [costCode]: displayName } });
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
    const ok = await reorderEstimateCategories(estimateId, orderedCostCodes, displayNamesByCode);
    if (!ok) return { ok: false, error: "Could not save category order." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save category order." };
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
    const ok = await moveEstimateItemsToCostCode(estimateId, itemIds, newCostCode, displayNameHint);
    if (!ok) return { ok: false, error: "Could not move items to this category." };
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not move items to this category." };
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
    const ok = await updateEstimateCategoryDisplayName(estimateId, costCode, trimmed);
    if (!ok) {
      // Fallback: legacy path in case direct category upsert fails in some environments.
      const legacyOk = await updateEstimateMeta(estimateId, { costCategoryNames: { [costCode]: trimmed } });
      if (!legacyOk) return { ok: false, error: "Could not save category name." };
    }
    revalidateEstimatePaths(estimateId);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not save category name." };
  }
}
