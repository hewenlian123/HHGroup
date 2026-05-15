"use server";

import { createServerSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isQuantityColumnUnsupported(error: { message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /quantity/i.test(message) && /column|generated|schema cache|could not find/i.test(message);
}

export async function createInvoiceDraftAction(payload: {
  invoiceNo?: string;
  projectId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  taxPct?: number;
  notes?: string;
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  allowIncomplete?: boolean;
}): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  const projectId = payload.projectId?.trim();
  if (!projectId && !payload.allowIncomplete) return { ok: false, error: "Project is required." };

  const clientName = payload.clientName?.trim();
  if (!clientName && !payload.allowIncomplete)
    return { ok: false, error: "Client name is required." };

  const items = (payload.lineItems ?? [])
    .map((l) => ({
      description: (l.description ?? "").trim(),
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.description.length > 0);

  if (items.length === 0 && !payload.allowIncomplete)
    return { ok: false, error: "At least one line item is required." };

  try {
    // Prefer admin client (service role) so INSERT + subsequent SELECT on detail page
    // won't be blocked by RLS/user mismatch.
    const admin = getServerSupabaseAdmin();
    const supabase = admin ?? (await createServerSupabaseClient());
    if (!supabase) return { ok: false, error: "Supabase is not configured." };
    if (!admin) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) return { ok: false, error: "You must be signed in." };
    }

    const safeIssueDate = String(payload.issueDate ?? "").slice(0, 10);
    const safeDueDate = String(payload.dueDate ?? "").slice(0, 10);
    const subtotal = items.reduce((s, l) => s + Math.max(0, l.qty) * Math.max(0, l.unitPrice), 0);
    const taxPct = toNum(payload.taxPct ?? 0);
    const taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    const customInvoiceNo = payload.invoiceNo?.trim();
    let invoiceNo = customInvoiceNo ?? "";
    if (!invoiceNo) {
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true });
      const nextNum = (count ?? 0) + 1;
      invoiceNo = `INV-${String(nextNum).padStart(4, "0")}`;
    }

    const { data: invRow, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_no: invoiceNo,
        project_id: projectId || null,
        client_name: clientName,
        issue_date: safeIssueDate,
        due_date: safeDueDate,
        status: "Draft",
        notes: payload.notes ?? null,
        tax_pct: taxPct,
        subtotal,
        tax_amount: taxAmount,
        total,
      })
      .select("id")
      .single();
    if (invErr || !invRow?.id)
      return { ok: false, error: invErr?.message ?? "Failed to create invoice." };

    const invoiceId = String(invRow.id);
    const itemRows = items.map((l) => ({
      invoice_id: invoiceId,
      description: l.description,
      qty: Math.max(0, l.qty),
      quantity: Math.max(0, l.qty),
      unit_price: Math.max(0, l.unitPrice),
      amount: Math.max(0, l.qty) * Math.max(0, l.unitPrice),
    }));
    if (itemRows.length > 0) {
      let { error: itemsErr } = await supabase.from("invoice_items").insert(itemRows);
      if (itemsErr && isQuantityColumnUnsupported(itemsErr)) {
        const fallbackRows = itemRows.map(
          ({ invoice_id, description, qty, unit_price, amount }) => ({
            invoice_id,
            description,
            qty,
            unit_price,
            amount,
          })
        );
        const fallback = await supabase.from("invoice_items").insert(fallbackRows);
        itemsErr = fallback.error;
      }
      if (itemsErr) {
        await supabase.from("invoices").delete().eq("id", invoiceId);
        return { ok: false, error: itemsErr.message ?? "Failed to create invoice items." };
      }
    }

    await supabase
      .from("invoices")
      .update({
        subtotal,
        tax_pct: taxPct,
        tax_amount: taxAmount,
        total,
      })
      .eq("id", invoiceId);

    return { ok: true, invoiceId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}
