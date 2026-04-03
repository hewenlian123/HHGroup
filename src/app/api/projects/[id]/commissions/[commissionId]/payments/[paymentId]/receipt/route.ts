import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCommissionById, getPaymentRecordById, updatePaymentRecord } from "@/lib/data";
import {
  parseCommissionReceiptStorageUrl,
  isStoragePathForCommissionReceipt,
} from "@/lib/commission-receipt-storage";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { uuidNormalizedEqual } from "@/lib/uuid-normalize";

/** New uploads use this bucket (legacy reads still accepted in parse helper). */
const BUCKET = "commission-receipts";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

/** Signed URL lifetime stored in DB (renew via View modal or re-upload). */
const RECEIPT_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365; // 365 days

/**
 * Upload jpg/png/pdf receipt for a commission payment; stores file in Storage and sets receipt_url.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });

  const supabase = getServerSupabaseAdmin();
  if (!supabase)
    return NextResponse.json(
      { ok: false, message: "Supabase service role is not configured." },
      { status: 500 }
    );

  try {
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

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ ok: false, message: "No file provided." }, { status: 400 });
    }
    const f = file as File;
    if (!f.size || f.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: "File is empty or exceeds 15 MB." },
        { status: 400 }
      );
    }
    const mime = (f.type || "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { ok: false, message: "Only JPG, PNG, and PDF files are allowed." },
        { status: 400 }
      );
    }

    const ext = extFromMime(mime);
    const path = `commission-payments/${paymentId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
      contentType: mime,
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json(
        {
          ok: false,
          message:
            upErr.message ||
            "Upload failed. Ensure Storage bucket 'commission-receipts' exists and policies allow access.",
        },
        { status: 500 }
      );
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, RECEIPT_SIGNED_URL_TTL_SEC);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        {
          ok: false,
          message:
            signErr?.message ??
            "Could not create signed URL for receipt. Check Storage bucket and policies.",
        },
        { status: 500 }
      );
    }

    const record = await updatePaymentRecord(paymentId, { receipt_url: signed.signedUrl });
    if (!record)
      return NextResponse.json(
        { ok: false, message: "Failed to save receipt URL." },
        { status: 500 }
      );

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}

/**
 * Remove uploaded file from Storage (if recognized) and clear receipt_url on the payment row.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; commissionId: string; paymentId: string }> }
) {
  const { id: projectId, commissionId, paymentId } = await ctx.params;
  if (!projectId || !commissionId || !paymentId)
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });

  const supabase = getServerSupabaseAdmin();
  if (!supabase)
    return NextResponse.json(
      { ok: false, message: "Supabase service role is not configured." },
      { status: 500 }
    );

  try {
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

    const url = existing.receipt_url?.trim();
    if (url) {
      const parsed = parseCommissionReceiptStorageUrl(url);
      if (parsed && isStoragePathForCommissionReceipt(paymentId, parsed.path)) {
        const { error: rmErr } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
        if (rmErr) console.error("[commission receipt DELETE] storage:", rmErr.message);
      }
    }

    const record = await updatePaymentRecord(paymentId, { receipt_url: null });
    if (!record)
      return NextResponse.json({ ok: false, message: "Failed to clear receipt." }, { status: 500 });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/financial/commissions");
    return NextResponse.json({ ok: true, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to remove receipt.";
    const status = /fetch failed|Database connection failed|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? 503
      : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
