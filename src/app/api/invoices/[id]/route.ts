import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { InvoiceDetailLoadError, loadInvoiceDetailWithClient } from "@/lib/invoice-detail-read";
import { attachServerTiming } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";

function logInvoiceApiError(context: string, error: unknown) {
  console.error(`[api/invoices] ${context}`, error);
}

function safeInvoiceApiResponse(message: string, status = 500) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const handlerStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  const authDuration = performance.now() - authStartedAt;
  let serverDataDuration = 0;
  const finish = <T extends Response>(response: T) =>
    attachServerTiming(response, {
      hh_auth: authDuration,
      hh_server_data: serverDataDuration,
      hh_handler_total: performance.now() - handlerStartedAt,
    });
  if (!guard.ok) return finish(guard.response);

  const { id } = await params;
  if (!id)
    return finish(
      NextResponse.json({ ok: false, message: "Missing invoice id." }, { status: 400 })
    );
  const serverDataStartedAt = performance.now();
  try {
    const data = await loadInvoiceDetailWithClient(id, guard.client);
    serverDataDuration = performance.now() - serverDataStartedAt;
    if (!data)
      return finish(
        NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 })
      );
    return finish(NextResponse.json({ ok: true, ...data }));
  } catch (e) {
    serverDataDuration = performance.now() - serverDataStartedAt;
    logInvoiceApiError(
      "unexpected invoice load error",
      e instanceof InvoiceDetailLoadError ? e.detail : e
    );
    return finish(
      safeInvoiceApiResponse(
        e instanceof InvoiceDetailLoadError ? e.message : "Failed to load invoice."
      )
    );
  }
}

type PatchBody = { action?: string };

/**
 * Void invoice (server-side). Allows transition from any non-Void stored status
 * (Draft, Sent, Partially Paid, Paid — including rows whose computed UI status is Unpaid / Overdue / Partial).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(req, { noStore: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, message: "Missing invoice id." }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  if (body.action !== "void") {
    return NextResponse.json({ ok: false, message: "Unsupported action." }, { status: 400 });
  }

  try {
    const supabase = guard.client;
    const invRes = await supabase.from("invoices").select("id, status").eq("id", id).maybeSingle();
    if (invRes.error) {
      logInvoiceApiError("failed to load invoice before void", invRes.error);
      return safeInvoiceApiResponse("Failed to load invoice.");
    }
    if (!invRes.data) {
      return NextResponse.json({ ok: false, message: "Invoice not found." }, { status: 404 });
    }

    const status = String((invRes.data as { status?: string }).status ?? "");
    if (status === "Void") {
      return NextResponse.json({ ok: true, message: "Already void." });
    }

    const { data: updated, error: updErr } = await supabase
      .from("invoices")
      .update({
        status: "Void",
        total: 0,
        subtotal: 0,
        tax_amount: 0,
        paid_total: 0,
        balance_due: 0,
      })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (updErr) {
      logInvoiceApiError("failed to void invoice", updErr);
      return safeInvoiceApiResponse("Failed to void invoice.");
    }
    if (!updated) {
      return safeInvoiceApiResponse("Invoice was not updated. Refresh and try again.", 409);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logInvoiceApiError("unexpected invoice void error", e);
    return safeInvoiceApiResponse("Failed to void invoice.");
  }
}
