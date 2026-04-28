import { NextResponse } from "next/server";
import { getCommissionById, getPaymentRecordById } from "@/lib/data";
import {
  COMMISSION_RECEIPT_BUCKETS,
  fileNameFromStoragePath,
  isPdfStoragePath,
  isStoragePathForCommissionReceipt,
  parseCommissionReceiptStorageUrl,
} from "@/lib/commission-receipt-storage";
import {
  createServerSupabaseClient,
  getServerSupabaseAdmin,
  getSupabaseUserFromRequest,
} from "@/lib/supabase-server";
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
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });

  try {
    const admin = getServerSupabaseAdmin();
    // If service role isn't configured in the environment, fall back to the current
    // authenticated user session (SSR cookies or Authorization header).
    const supabase = admin ?? (await createServerSupabaseClient());
    if (!supabase) {
      return NextResponse.json(
        { ok: false, message: "Supabase is not configured." },
        { status: 500 }
      );
    }
    if (!admin) {
      const user = await getSupabaseUserFromRequest(req);
      if (!user) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Not signed in (or session missing). Please log in again and retry viewing the receipt.",
          },
          { status: 401 }
        );
      }
    }

    const commission = await getCommissionById(commissionId);
    if (!commission)
      return NextResponse.json({ ok: false, message: "Commission not found" }, { status: 404 });
    if (!uuidNormalizedEqual(commission.project_id, projectId))
      return NextResponse.json(
        { ok: false, message: "Commission does not belong to this project" },
        { status: 400 }
      );
    const existing = await getPaymentRecordById(paymentId);
    if (!existing)
      return NextResponse.json({ ok: false, message: "Payment not found" }, { status: 404 });
    if (!uuidNormalizedEqual(existing.commission_id, commissionId))
      return NextResponse.json(
        { ok: false, message: "Payment does not match commission" },
        { status: 400 }
      );

    const raw = existing.receipt_url?.trim();
    if (!raw)
      return NextResponse.json(
        { ok: false, message: "No receipt uploaded for this payment." },
        { status: 404 }
      );

    const parsed = parseCommissionReceiptStorageUrl(raw);
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Stored receipt URL is not a commission storage link. Remove it and upload again, or contact support.",
        },
        { status: 400 }
      );
    }
    if (!ALLOWED_BUCKETS.has(parsed.bucket)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Receipt must be in commission-receipts (or legacy commission-payment-receipts).",
        },
        { status: 400 }
      );
    }
    if (!isStoragePathForCommissionReceipt(paymentId, parsed.path)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Receipt file path does not match this payment record (the saved URL may point at the wrong file). Re-upload the receipt.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, VIEW_SIGNED_TTL_SEC);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        {
          ok: false,
          message: error?.message ?? "Could not create signed URL for receipt.",
        },
        { status: admin ? 500 : 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: data.signedUrl,
      fileName: fileNameFromStoragePath(parsed.path),
      isPdf: isPdfStoragePath(parsed.path),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve receipt URL.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
