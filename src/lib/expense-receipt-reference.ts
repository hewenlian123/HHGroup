export const EXPENSE_RECEIPT_BUCKETS = ["expense-attachments", "receipts"] as const;

export type ExpenseReceiptBucket = (typeof EXPENSE_RECEIPT_BUCKETS)[number];
export type ReceiptSourceKind = "expense_receipt_url" | "attachment" | "expense_attachment";

export type NormalizedReceiptLocation = {
  bucket: ExpenseReceiptBucket;
  path: string;
};

export type ReceiptReferenceInput = {
  sourceKind: ReceiptSourceKind;
  expenseId: string;
  sourceId: string;
  rawReference: string;
};

const STORAGE_OBJECT_SEGMENT = "/storage/v1/object/";
const STORAGE_ACCESS_MODES = new Set(["public", "sign", "authenticated"]);

function receiptBucket(value: string): ExpenseReceiptBucket | null {
  return EXPENSE_RECEIPT_BUCKETS.find((bucket) => bucket === value) ?? null;
}

function decodeSafePath(rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = rawPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }

  const normalized = decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized.includes("\\") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

function parseStorageUrl(value: string): NormalizedReceiptLocation | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const objectIndex = url.pathname.indexOf(STORAGE_OBJECT_SEGMENT);
  if (objectIndex < 0) return null;
  const tail = url.pathname.slice(objectIndex + STORAGE_OBJECT_SEGMENT.length);
  const parts = tail.split("/");
  const accessMode = parts.shift() ?? "";
  if (!STORAGE_ACCESS_MODES.has(accessMode)) return null;
  const bucket = receiptBucket(parts.shift() ?? "");
  if (!bucket) return null;
  const path = decodeSafePath(parts.join("/"));
  return path ? { bucket, path } : null;
}

/**
 * Converts historical receipt references into a private Storage bucket/path pair.
 * Query strings, fragments, signed tokens, unsupported buckets, and traversal are rejected.
 */
export function normalizeReceiptLocation(raw: string): NormalizedReceiptLocation | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return parseStorageUrl(value);

  const withoutQuery = value.split(/[?#]/, 1)[0] ?? "";
  const decoded = decodeSafePath(withoutQuery);
  if (!decoded) return null;

  const [first, ...rest] = decoded.split("/");
  const explicitBucket = receiptBucket(first ?? "");
  if (explicitBucket) {
    const path = decodeSafePath(rest.join("/"));
    return path ? { bucket: explicitBucket, path } : null;
  }

  // A bucket-like first segment is not treated as an expense-attachments path.
  if (/bucket$/i.test(first ?? "") || first === "other-bucket") return null;
  return { bucket: "expense-attachments", path: decoded };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Optimistic token for one exact stored source reference. */
export async function receiptReferenceVersion(input: ReceiptReferenceInput): Promise<string> {
  const serialized = JSON.stringify([
    input.sourceKind,
    input.expenseId,
    input.sourceId,
    input.rawReference,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return bytesToHex(new Uint8Array(digest));
}

export function receiptReferenceId(sourceKind: ReceiptSourceKind, sourceId: string): string {
  return `${sourceKind}.${sourceId}`;
}

export function parseReceiptReferenceId(
  value: string
): { sourceKind: ReceiptSourceKind; sourceId: string } | null {
  const match = /^(expense_receipt_url|attachment|expense_attachment)\.([0-9a-f-]{36})$/i.exec(
    value
  );
  if (!match) return null;
  return {
    sourceKind: match[1]!.toLowerCase() as ReceiptSourceKind,
    sourceId: match[2]!.toLowerCase(),
  };
}
