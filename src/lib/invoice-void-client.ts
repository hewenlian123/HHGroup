/**
 * Void invoice from the browser via API route so updates use server Supabase
 * (service role when configured) and are not blocked by RLS on direct client writes.
 */
export async function voidInvoiceFromClient(
  invoiceId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "void" }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      message: data.message ?? `Request failed (${res.status})`,
    };
  }
  return { ok: true };
}
