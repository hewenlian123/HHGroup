import { NextRequest, NextResponse } from "next/server";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { parseReceiptReferenceId, receiptReferenceVersion } from "@/lib/expense-receipt-reference";
import { resolveStoredReceiptReference } from "@/lib/expense-receipt-server";
import { recordSecurityAudit } from "@/lib/security-audit";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_VERSION_PATTERN = /^[a-f0-9]{64}$/;
const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;
const SIGNED_RECEIPT_TTL_SECONDS = 300;

const FILE_TYPES = {
  "application/pdf": { extension: "pdf", acceptedExtensions: new Set(["pdf"]) },
  "image/gif": { extension: "gif", acceptedExtensions: new Set(["gif"]) },
  "image/heic": { extension: "heic", acceptedExtensions: new Set(["heic"]) },
  "image/heif": { extension: "heif", acceptedExtensions: new Set(["heif"]) },
  "image/jpeg": { extension: "jpg", acceptedExtensions: new Set(["jpg", "jpeg"]) },
  "image/png": { extension: "png", acceptedExtensions: new Set(["png"]) },
  "image/webp": { extension: "webp", acceptedExtensions: new Set(["webp"]) },
} as const;

type AllowedMimeType = keyof typeof FILE_TYPES;

function privateJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function safeFileNameFromPath(path: string): string {
  return path.split("/").pop()?.trim() || "Receipt";
}

function mimeTypeFromPath(path: string): AllowedMimeType {
  const extension = path.split(".").pop()?.toLowerCase();
  const match = Object.entries(FILE_TYPES).find(([, value]) =>
    value.acceptedExtensions.has(extension as never)
  );
  return (match?.[0] as AllowedMimeType | undefined) ?? "image/jpeg";
}

function validatedFile(
  value: FormDataEntryValue | null
): { ok: true; file: File; extension: string; mimeType: AllowedMimeType } | { ok: false } {
  if (!(value instanceof File) || value.size <= 0 || value.size > MAX_RECEIPT_BYTES) {
    return { ok: false };
  }
  const mimeType = value.type.trim().toLowerCase() as AllowedMimeType;
  const config = FILE_TYPES[mimeType];
  if (!config) return { ok: false };
  const extension = value.name.split(".").pop()?.trim().toLowerCase() ?? "";
  if (!config.acceptedExtensions.has(extension as never)) return { ok: false };
  return { ok: true, file: value, extension: config.extension, mimeType };
}

async function signCommittedReceipt(input: {
  admin: NonNullable<ReturnType<typeof getServerSupabaseAdmin>>;
  expenseId: string;
  receiptId: string;
  sourceKind: "expense_receipt_url" | "attachment" | "expense_attachment";
  sourceId: string;
  path: string;
  mimeType: AllowedMimeType;
  fileName: string;
  idempotent: boolean;
}): Promise<NextResponse> {
  const { data, error } = await input.admin.storage
    .from("expense-attachments")
    .createSignedUrl(input.path, SIGNED_RECEIPT_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return privateJson(
      {
        ok: false,
        message: "The receipt was replaced, but its preview is temporarily unavailable.",
      },
      503
    );
  }
  const referenceVersion = await receiptReferenceVersion({
    expenseId: input.expenseId,
    rawReference: input.path,
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
  });
  return privateJson({
    ok: true,
    idempotent: input.idempotent,
    item: {
      id: input.receiptId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      referenceVersion,
      signedUrl: data.signedUrl,
    },
    expiresAt: new Date(Date.now() + SIGNED_RECEIPT_TTL_SECONDS * 1000).toISOString(),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; receiptId: string } }
): Promise<NextResponse> {
  const auth = await requireSupabaseOwnerOrAdmin(request);
  if (!auth.ok) return auth.response;

  const sameOrigin = validateSameOriginMutation(request);
  if (!sameOrigin.ok) {
    return privateJson({ ok: false, message: sameOrigin.message }, sameOrigin.status);
  }

  const expenseId = (params.id ?? "").trim().toLowerCase();
  const receiptId = (params.receiptId ?? "").trim();
  const parsedReceiptId = parseReceiptReferenceId(receiptId);
  if (!UUID_PATTERN.test(expenseId) || !parsedReceiptId) {
    return privateJson({ ok: false, message: "Invalid receipt replacement request." }, 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return privateJson({ ok: false, message: "Invalid receipt replacement request." }, 400);
  }
  const referenceVersion = String(formData.get("referenceVersion") ?? "")
    .trim()
    .toLowerCase();
  const operationId = String(formData.get("idempotencyKey") ?? "")
    .trim()
    .toLowerCase();
  const fileResult = validatedFile(formData.get("file"));
  if (
    !fileResult.ok ||
    !REFERENCE_VERSION_PATTERN.test(referenceVersion) ||
    !UUID_PATTERN.test(operationId)
  ) {
    return privateJson({ ok: false, message: "Invalid receipt replacement request." }, 400);
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return privateJson({ ok: false, message: "Receipt replacement is unavailable." }, 503);
  }

  // A repeated operation key returns the already-committed immutable object before
  // re-evaluating the now-stale prior reference version.
  const existingResult = await admin
    .from("receipt_storage_cleanup_candidates")
    .select(
      "operation_id, expense_id, source_kind, source_id, replacement_bucket, replacement_path, created_by"
    )
    .eq("operation_id", operationId)
    .maybeSingle();
  if (existingResult.error) {
    return privateJson({ ok: false, message: "Receipt replacement is unavailable." }, 503);
  }
  if (existingResult.data) {
    const existing = existingResult.data;
    const sameOperation =
      existing.expense_id === expenseId &&
      existing.source_kind === parsedReceiptId.sourceKind &&
      existing.source_id === parsedReceiptId.sourceId &&
      existing.created_by === auth.context.user.id &&
      existing.replacement_bucket === "expense-attachments" &&
      typeof existing.replacement_path === "string";
    if (!sameOperation) {
      return privateJson({ ok: false, message: "Receipt replacement conflict." }, 409);
    }
    const path = String(existing.replacement_path);
    return signCommittedReceipt({
      admin,
      expenseId,
      receiptId,
      sourceKind: parsedReceiptId.sourceKind,
      sourceId: parsedReceiptId.sourceId,
      path,
      mimeType: mimeTypeFromPath(path),
      fileName: safeFileNameFromPath(path),
      idempotent: true,
    });
  }

  let selected: Awaited<ReturnType<typeof resolveStoredReceiptReference>>;
  try {
    selected = await resolveStoredReceiptReference({ expenseId, receiptId });
  } catch {
    return privateJson({ ok: false, message: "Receipt replacement is unavailable." }, 404);
  }
  if (selected.referenceVersion !== referenceVersion) {
    return privateJson(
      { ok: false, message: "This receipt changed. Refresh it before replacing." },
      409
    );
  }

  const newPath = `replacements/expenses/${expenseId}/${operationId}.${fileResult.extension}`;
  const uploadResult = await admin.storage
    .from("expense-attachments")
    .upload(newPath, fileResult.file, {
      contentType: fileResult.mimeType,
      upsert: false,
    });
  if (uploadResult.error) {
    await recordSecurityAudit({
      eventType: "receipt_replace_failed",
      userId: auth.context.user.id,
      metadata: { expense_id: expenseId, phase: "upload" },
    });
    return privateJson({ ok: false, message: "Receipt replacement failed." }, 502);
  }

  const transaction = await admin.rpc("replace_expense_receipt_reference", {
    p_actor_user_id: auth.context.user.id,
    p_expected_reference: selected.rawReference,
    p_expense_id: expenseId,
    p_new_reference: newPath,
    p_old_bucket: selected.location.bucket,
    p_old_path: selected.location.path,
    p_operation_id: operationId,
    p_source_id: selected.sourceId,
    p_source_kind: selected.sourceKind,
  });
  const result = Array.isArray(transaction.data) ? transaction.data[0] : transaction.data;
  if (transaction.error || !result?.changed) {
    await admin.storage.from("expense-attachments").remove([newPath]);
    await recordSecurityAudit({
      eventType: "receipt_replace_failed",
      userId: auth.context.user.id,
      metadata: { expense_id: expenseId, phase: "commit" },
    });
    return privateJson(
      { ok: false, message: "This receipt changed. Refresh it before replacing." },
      409
    );
  }

  return signCommittedReceipt({
    admin,
    expenseId,
    receiptId,
    sourceKind: selected.sourceKind,
    sourceId: selected.sourceId,
    path: newPath,
    mimeType: fileResult.mimeType,
    fileName: fileResult.file.name,
    idempotent: Boolean(result.idempotent),
  });
}
