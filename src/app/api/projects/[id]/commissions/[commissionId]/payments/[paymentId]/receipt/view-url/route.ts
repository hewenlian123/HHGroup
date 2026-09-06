import { withSessionCookies } from "@/lib/supabase-response";
import { NextResponse } from "next/server";
import { requireOrganizationRequestClient } from "@/lib/auth-boundary";
import { getCommissionById, getPaymentRecordById } from "@/lib/data";
import {
  COMMISSION_RECEIPT_BUCKETS,
  fileNameFromStoragePath,
  isPdfStoragePath,
  isStoragePathForCommissionReceipt,
  parseCommissionReceiptStorageUrl,
} from "@/lib/commission-receipt-storage";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { uuidNormalizedEqual } from "@/lib/uuid-normalize";

const ALLOWED_BUCKETS = new Set<string>(COMMISSION_RECEIPT_BUCKETS);
/** Short-lived URL; client requests a new one each time the View modal opens. */
const VIEW_SIGNED_TTL_SEC = 60 * 60;

/**
 * Returns a fresh signed URL for the payment's receipt file after validating that
 * `receipt_url` points at commission-receipts storage under this payment's path.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const guard = await requireOrganizationRequestClient(req, {
    projectId: (await ctx.params).id,
    write: req.method !== "GET",
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) return guard.response;
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return withSessionCookies(
      NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 }),
      guard.sessionResponse
    );

  try {
    const storageAdmin = getServerSupabaseAdmin();
    const storageClient = storageAdmin ?? guard.client;
    const commission = await getCommissionById(commissionId, guard.client);
    if (!commission)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Commission does not belong to this project" },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    const existing = await getPaymentRecordById(paymentId, guard.client);
    if (!existing)
      return withSessionCookies(
        NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 }),
        guard.sessionResponse
      );
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "Payment does not match commission" },
          { status: 400 }
        ),
        guard.sessionResponse
      );

    const raw = existing.receipt_url?.trim();
    if (!raw)
      return withSessionCookies(
        NextResponse.json(
          { ok: false, message: "No receipt uploaded for this payment." },
          { status: 404 }
        ),
        guard.sessionResponse
      );

    const parsed = parseCommissionReceiptStorageUrl(raw);
    if (!parsed) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message:
              "Stored receipt URL is not a commission storage link. Remove it and upload again, or contact support.",
          },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }
    if (!ALLOWED_BUCKETS.has(parsed.bucket)) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message:
              "Receipt must be in commission-receipts (or legacy commission-payment-receipts).",
          },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }
    if (!isStoragePathForCommissionReceipt(paymentId, parsed.path)) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message:
              "Receipt file path does not match this payment record (the saved URL may point at the wrong file). Re-upload the receipt.",
          },
          { status: 400 }
        ),
        guard.sessionResponse
      );
    }

    const { data, error } = await storageClient.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, VIEW_SIGNED_TTL_SEC);
    if (error || !data?.signedUrl) {
      return withSessionCookies(
        NextResponse.json(
          {
            ok: false,
            message: error?.message ?? "Could not create signed URL for receipt.",
          },
          { status: storageAdmin ? 500 : 403 }
        ),
        guard.sessionResponse
      );
    }

    return withSessionCookies(
      NextResponse.json({
        ok: true,
        url: data.signedUrl,
        fileName: fileNameFromStoragePath(parsed.path),
        isPdf: isPdfStoragePath(parsed.path),
      }),
      guard.sessionResponse
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve receipt URL.";
    return withSessionCookies(
      NextResponse.json({ ok: false, message }, { status: 500 }),
      guard.sessionResponse
    );
  }
}
