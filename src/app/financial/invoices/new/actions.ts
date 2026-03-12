"use server";

import { createInvoice } from "@/lib/data";

export async function createInvoiceDraftAction(payload: {
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  taxPct?: number;
  notes?: string;
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
}): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  const projectId = payload.projectId?.trim();
  if (!projectId) return { ok: false, error: "projectId is required" };

  const clientName = payload.clientName?.trim();
  if (!clientName) return { ok: false, error: "clientName is required" };

  const items = (payload.lineItems ?? [])
    .map((l) => ({
      description: (l.description ?? "").trim(),
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.description.length > 0);

  if (items.length === 0) return { ok: false, error: "lineItems is required" };

  try {
    const inv = await createInvoice({
      projectId,
      clientName,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      taxPct: payload.taxPct ?? 0,
      notes: payload.notes,
      lineItems: items.map((l) => ({
        description: l.description,
        qty: Math.max(0, l.qty),
        unitPrice: Math.max(0, l.unitPrice),
        amount: Math.max(0, l.qty) * Math.max(0, l.unitPrice),
      })),
    });
    return { ok: true, invoiceId: inv.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

