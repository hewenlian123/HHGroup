import "server-only";

import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  normalizeReceiptLocation,
  receiptReferenceId,
  receiptReferenceVersion,
  type NormalizedReceiptLocation,
  type ReceiptSourceKind,
} from "@/lib/expense-receipt-reference";

const SIGNED_RECEIPT_TTL_SECONDS = 300;

type StoredReceiptReference = {
  sourceKind: ReceiptSourceKind;
  sourceId: string;
  expenseId: string;
  rawReference: string;
  fileName: string;
  mimeType: string;
};

export type ExpenseReceiptManifestItem = {
  id: string;
  fileName: string;
  mimeType: string;
  signedUrl: string;
  referenceVersion: string;
};

export type ExpenseReceiptManifest = {
  expenseId: string;
  expiresAt: string;
  items: ExpenseReceiptManifestItem[];
};

export class ExpenseReceiptManifestError extends Error {
  constructor(public readonly code: "not_found" | "unavailable" | "not_configured") {
    super("Receipt preview is unavailable.");
    this.name = "ExpenseReceiptManifestError";
  }
}

function displayFileName(rawReference: string, fallback: string): string {
  const location = normalizeReceiptLocation(rawReference);
  const tail = location?.path.split("/").pop()?.trim();
  return tail || fallback;
}

function displayMimeType(fileName: string, supplied?: string | null): string {
  const explicit = (supplied ?? "").trim().toLowerCase();
  if (explicit.includes("/")) return explicit;
  const value = `${fileName} ${explicit}`.toLowerCase();
  if (value.includes(".pdf") || explicit === "pdf") return "application/pdf";
  if (value.includes(".png") || explicit === "png") return "image/png";
  if (value.includes(".webp") || explicit === "webp") return "image/webp";
  if (value.includes(".gif") || explicit === "gif") return "image/gif";
  return "image/jpeg";
}

async function loadStoredReceiptReferences(expenseId: string): Promise<StoredReceiptReference[]> {
  const admin = getServerSupabaseAdmin();
  if (!admin) throw new ExpenseReceiptManifestError("not_configured");

  const [expenseResult, attachmentResult, dedicatedResult] = await Promise.all([
    admin.from("expenses").select("id, receipt_url").eq("id", expenseId).maybeSingle(),
    admin
      .from("attachments")
      .select("id, file_name, file_path, mime_type")
      .eq("entity_type", "expense")
      .eq("entity_id", expenseId)
      .order("created_at", { ascending: true }),
    admin
      .from("expense_attachments")
      .select("id, file_url, file_type")
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: true }),
  ]);

  if (expenseResult.error || attachmentResult.error || dedicatedResult.error) {
    throw new ExpenseReceiptManifestError("unavailable");
  }
  if (!expenseResult.data) throw new ExpenseReceiptManifestError("not_found");

  const references: StoredReceiptReference[] = [];
  const receiptUrl = String(expenseResult.data.receipt_url ?? "").trim();
  if (receiptUrl) {
    const fileName = displayFileName(receiptUrl, "Receipt");
    references.push({
      sourceKind: "expense_receipt_url",
      sourceId: expenseId,
      expenseId,
      rawReference: receiptUrl,
      fileName,
      mimeType: displayMimeType(fileName),
    });
  }

  for (const row of attachmentResult.data ?? []) {
    const rawReference = String(row.file_path ?? "").trim();
    if (!rawReference) continue;
    const fileName =
      String(row.file_name ?? "").trim() || displayFileName(rawReference, "Attachment");
    references.push({
      sourceKind: "attachment",
      sourceId: String(row.id),
      expenseId,
      rawReference,
      fileName,
      mimeType: displayMimeType(fileName, row.mime_type),
    });
  }

  for (const row of dedicatedResult.data ?? []) {
    const rawReference = String(row.file_url ?? "").trim();
    if (!rawReference) continue;
    const fileName = displayFileName(rawReference, "Attachment");
    references.push({
      sourceKind: "expense_attachment",
      sourceId: String(row.id),
      expenseId,
      rawReference,
      fileName,
      mimeType: displayMimeType(fileName, row.file_type),
    });
  }

  return references;
}

export async function resolveStoredReceiptReference(input: {
  expenseId: string;
  receiptId: string;
}): Promise<
  StoredReceiptReference & {
    location: NormalizedReceiptLocation;
    referenceVersion: string;
  }
> {
  const references = await loadStoredReceiptReferences(input.expenseId);
  const selected = references.find(
    (reference) => receiptReferenceId(reference.sourceKind, reference.sourceId) === input.receiptId
  );
  if (!selected) throw new ExpenseReceiptManifestError("not_found");
  const location = normalizeReceiptLocation(selected.rawReference);
  if (!location) throw new ExpenseReceiptManifestError("unavailable");
  return {
    ...selected,
    location,
    referenceVersion: await receiptReferenceVersion(selected),
  };
}

export async function loadExpenseReceiptManifest(
  expenseId: string
): Promise<ExpenseReceiptManifest> {
  const admin = getServerSupabaseAdmin();
  if (!admin) throw new ExpenseReceiptManifestError("not_configured");

  const references = await loadStoredReceiptReferences(expenseId);
  const seenLocations = new Set<string>();
  const items: ExpenseReceiptManifestItem[] = [];

  for (const reference of references) {
    const location = normalizeReceiptLocation(reference.rawReference);
    if (!location) continue;
    const locationKey = `${location.bucket}/${location.path}`;
    if (seenLocations.has(locationKey)) continue;
    seenLocations.add(locationKey);

    const { data, error } = await admin.storage
      .from(location.bucket)
      .createSignedUrl(location.path, SIGNED_RECEIPT_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new ExpenseReceiptManifestError("unavailable");

    items.push({
      id: receiptReferenceId(reference.sourceKind, reference.sourceId),
      fileName: reference.fileName,
      mimeType: reference.mimeType,
      signedUrl: data.signedUrl,
      referenceVersion: await receiptReferenceVersion(reference),
    });
  }

  if (items.length === 0) throw new ExpenseReceiptManifestError("not_found");
  return {
    expenseId,
    expiresAt: new Date(Date.now() + SIGNED_RECEIPT_TTL_SECONDS * 1000).toISOString(),
    items,
  };
}
