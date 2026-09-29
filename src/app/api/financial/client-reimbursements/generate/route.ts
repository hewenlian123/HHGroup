import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { buildClientReimbursementPdf } from "@/lib/client-reimbursement-pdf";
import { reimbursementRequestLinesAreCompatible } from "@/lib/client-reimbursement";
import { loadClientReimbursements } from "@/lib/client-reimbursement-db";
import { uploadDocumentFile } from "@/lib/document-storage";
import { normalizeReceiptLocation } from "@/lib/expense-receipt-reference";
import { getExpenseById } from "@/lib/expenses-db";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { FinancialDataUnavailableError } from "@/lib/profit-engine";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function receiptBytes(client: SupabaseClient, reference: string): Promise<Uint8Array | null> {
  const location = normalizeReceiptLocation(reference);
  if (!location) return null;
  const downloaded = await client.storage.from(location.bucket).download(location.path);
  if (downloaded.error || !downloaded.data) return null;
  return new Uint8Array(await downloaded.data.arrayBuffer());
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;
  if (!guard.client) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503 }
    );
  }
  let body: { lineIds?: unknown };
  try {
    body = (await request.json()) as { lineIds?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid payload." }, { status: 400 });
  }
  const lineIds = Array.isArray(body.lineIds)
    ? body.lineIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  let listed;
  try {
    listed = await loadClientReimbursements(guard.client);
  } catch (error) {
    const message =
      error instanceof FinancialDataUnavailableError
        ? error.message
        : "Reimbursements are unavailable.";
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
  const selected = listed.rows.filter((row) => lineIds.includes(row.lineId));
  if (selected.length !== lineIds.length) {
    return NextResponse.json(
      { ok: false, message: "Choose client-reimbursable expenses." },
      { status: 409 }
    );
  }
  const incompatible = reimbursementRequestLinesAreCompatible(
    selected.map((row) => ({ projectId: row.projectId, status: row.status }))
  );
  if (incompatible) {
    return NextResponse.json({ ok: false, message: incompatible }, { status: 409 });
  }
  const requestedOn = hawaiiTodayYmd();
  const reserved = await guard.client.rpc("reserve_client_reimbursement_request", {
    p_line_ids: lineIds,
    p_requested_on: requestedOn,
  });
  if (reserved.error || !reserved.data) {
    return NextResponse.json(
      { ok: false, message: reserved.error?.message ?? "Could not reserve a request number." },
      { status: 409 }
    );
  }
  const requestId = String((reserved.data as { request_id?: string }).request_id ?? "");
  const requestNo = String((reserved.data as { request_no?: string }).request_no ?? "");
  const first = selected[0]!;

  try {
    const receipts: Array<{ fileName: string; bytes: Uint8Array }> = [];
    const seen = new Set<string>();
    for (const expenseId of [...new Set(selected.map((row) => row.expenseId))]) {
      const expense = await getExpenseById(expenseId, guard.client);
      const references = [
        expense?.receiptUrl ?? "",
        ...(expense?.attachments ?? []).map((item) => item.url),
      ].filter(Boolean);
      for (const reference of references) {
        if (seen.has(reference)) continue;
        seen.add(reference);
        const bytes = await receiptBytes(guard.client, reference);
        if (!bytes) {
          throw new Error("A scanned receipt could not be read for the backup pages.");
        }
        receipts.push({ fileName: reference.split("/").pop() || "receipt", bytes });
      }
    }

    const pdf = await buildClientReimbursementPdf({
      requestNo,
      requestedOn,
      clientName: first.clientName,
      projectName: first.projectName,
      projectAddress: first.projectAddress,
      lines: selected.map((row) => ({
        date: row.expenseDate,
        vendor: row.vendorName,
        invoiceNumber: row.invoiceNumber,
        description: row.description,
        amount: row.amount,
      })),
      receipts,
    });
    const document = await uploadDocumentFile(
      guard.client,
      {
        file_name: `${requestNo} client reimbursement.pdf`,
        file_type: "Invoice",
        mime_type: "application/pdf",
        size_bytes: pdf.byteLength,
        project_id: first.projectId,
        related_module: "client_reimbursement",
        related_id: requestId,
        notes: `Client reimbursement ${requestNo}`,
      },
      new Blob([Buffer.from(pdf)], { type: "application/pdf" })
    );
    const attached = await guard.client.rpc("attach_client_reimbursement_document", {
      p_request_id: requestId,
      p_line_ids: lineIds,
      p_document_id: document.id,
    });
    if (attached.error) {
      throw new Error(attached.error.message);
    }
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${requestNo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await guard.client.from("client_reimbursement_requests").delete().eq("id", requestId);
    const message =
      error instanceof Error ? error.message : "Could not generate the reimbursement PDF.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
