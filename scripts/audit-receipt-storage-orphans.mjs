import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const TARGET_BUCKETS = new Set(["expense-attachments", "receipts"]);
const ACCESS_MODES = new Set(["public", "sign", "authenticated"]);

function safePath(value) {
  try {
    const decoded = String(value)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
      .replace(/^\/+|\/+$/g, "");
    if (!decoded || decoded.includes("\\") || decoded.includes("\0")) return null;
    if (decoded.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function normalizeReceiptAuditReference(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const marker = "/storage/v1/object/";
      const index = url.pathname.indexOf(marker);
      if (index < 0) return null;
      const parts = url.pathname.slice(index + marker.length).split("/");
      if (!ACCESS_MODES.has(parts.shift())) return null;
      const bucket = parts.shift();
      const objectPath = safePath(parts.join("/"));
      return TARGET_BUCKETS.has(bucket) && objectPath ? { bucket, path: objectPath } : null;
    } catch {
      return null;
    }
  }

  const objectPath = safePath(value.split(/[?#]/, 1)[0]);
  if (!objectPath) return null;
  const [first, ...rest] = objectPath.split("/");
  if (TARGET_BUCKETS.has(first)) {
    const explicitPath = safePath(rest.join("/"));
    return explicitPath ? { bucket: first, path: explicitPath } : null;
  }
  return { bucket: "expense-attachments", path: objectPath };
}

export function classifyReceiptStorageObjects({ objects, references, retained }) {
  const referenceKeys = new Set(references.map(({ bucket, path }) => `${bucket}/${path}`));
  const retainedKeys = new Set(retained.map(({ bucket, path }) => `${bucket}/${path}`));
  return [...objects]
    .sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`))
    .map((object) => {
      const key = `${object.bucket}/${object.path}`;
      return {
        ...object,
        classification: referenceKeys.has(key)
          ? "referenced"
          : retainedKeys.has(key)
            ? "retained_after_replace"
            : "orphan_candidate",
      };
    });
}

function hashRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function run() {
  const connectionString =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const parsed = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("Receipt orphan audit is restricted to local Docker Supabase.");
  }

  const sql = postgres(connectionString, { max: 1, prepare: false });
  try {
    const snapshot = await sql.begin(async (tx) => {
      await tx`set transaction read only`;
      const [expenses, attachments, dedicated, queue, objects, cleanup] = await Promise.all([
        tx`select id, receipt_url from public.expenses where receipt_url is not null and btrim(receipt_url) <> ''`,
        tx`select id, entity_id, file_path from public.attachments where entity_type = 'expense' and file_path is not null and btrim(file_path) <> ''`,
        tx`select id, expense_id, file_url from public.expense_attachments where file_url is not null and btrim(file_url) <> ''`,
        tx`select id, storage_path, receipt_public_url from public.receipt_queue where coalesce(storage_path, '') <> '' or coalesce(receipt_public_url, '') <> ''`,
        tx`select bucket_id as bucket, name as path, created_at, updated_at, coalesce((metadata ->> 'size')::bigint, 0) as size_bytes from storage.objects where bucket_id in ('expense-attachments', 'receipts') order by bucket_id, name`,
        tx`select old_bucket, old_path, replacement_bucket, replacement_path, status from public.receipt_storage_cleanup_candidates order by created_at`,
      ]);
      return { expenses, attachments, dedicated, queue, objects, cleanup };
    });

    const references = [];
    const addReference = (raw, source) => {
      const normalized = normalizeReceiptAuditReference(raw);
      if (normalized) references.push({ ...normalized, source });
    };
    for (const row of snapshot.expenses) addReference(row.receipt_url, `expenses:${row.id}`);
    for (const row of snapshot.attachments) addReference(row.file_path, `attachments:${row.id}`);
    for (const row of snapshot.dedicated)
      addReference(row.file_url, `expense_attachments:${row.id}`);
    for (const row of snapshot.queue) {
      addReference(row.storage_path, `receipt_queue:${row.id}:storage_path`);
      addReference(row.receipt_public_url, `receipt_queue:${row.id}:receipt_public_url`);
    }

    const retained = snapshot.cleanup.flatMap((row) => [
      { bucket: row.old_bucket, path: row.old_path },
      { bucket: row.replacement_bucket, path: row.replacement_path },
    ]);
    const classified = classifyReceiptStorageObjects({
      objects: snapshot.objects.map((row) => ({
        bucket: row.bucket,
        path: row.path,
        sizeBytes: Number(row.size_bytes),
      })),
      references,
      retained,
    });
    const summary = Object.fromEntries(
      ["referenced", "retained_after_replace", "orphan_candidate"].map((classification) => [
        classification,
        classified.filter((row) => row.classification === classification).length,
      ])
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          localHost: parsed.hostname,
          objects: classified.length,
          references: references.length,
          cleanupEvidenceRows: snapshot.cleanup.length,
          classifications: summary,
          objectSnapshotSha256: hashRows(
            classified.map(({ bucket, path, sizeBytes }) => ({ bucket, path, sizeBytes }))
          ),
          orphanCandidates: classified
            .filter((row) => row.classification === "orphan_candidate")
            .map(({ bucket, path, sizeBytes }) => ({ bucket, path, sizeBytes })),
        },
        null,
        2
      )}\n`
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
