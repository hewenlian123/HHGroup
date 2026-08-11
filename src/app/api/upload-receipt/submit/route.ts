import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { isWorkerReceiptUploadPath, WORKER_RECEIPT_BUCKET } from "@/lib/worker-receipt-storage";

const MAX_WORKER_RECEIPT_AMOUNT = 100_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPENSE_TYPES = new Set([
  "Building Materials",
  "Tools",
  "Food",
  "Transportation",
  "Supplies",
  "Other",
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function trimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeWorkerReceiptUploadPath(value: string): string | null {
  if (isWorkerReceiptUploadPath(value)) return value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) return null;

  try {
    const parsed = new URL(value);
    const expected = new URL(supabaseUrl);
    if (parsed.origin !== expected.origin) return null;
    if (parsed.search || parsed.hash) return null;

    const prefix = `/storage/v1/object/public/${WORKER_RECEIPT_BUCKET}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const storagePath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return isWorkerReceiptUploadPath(storagePath) ? storagePath : null;
  } catch {
    return null;
  }
}

/**
 * Public worker receipt submission. The anon/RLS client is deliberately used so this route
 * cannot bypass the worker_receipts policy or create records with service-role authority.
 */
export async function POST(req: Request) {
  try {
    const supabase = getServerSupabase();
    if (!supabase) {
      return jsonError("Receipt submission is temporarily unavailable.", 500);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return jsonError("Invalid receipt submission.", 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonError("Invalid receipt submission.", 400);
    }

    const workerId = trimText(body.workerId, 64);
    const workerName = trimText(body.workerName, 120) ?? "";
    const projectIdRaw = trimText(body.projectId, 64);
    const projectId = projectIdRaw && UUID_RE.test(projectIdRaw) ? projectIdRaw : null;
    const expenseTypeRaw = trimText(body.expenseType, 60) ?? "Other";
    const expenseType = EXPENSE_TYPES.has(expenseTypeRaw) ? expenseTypeRaw : "Other";
    const vendor = trimText(body.vendor, 160);
    const amount = Number(body.amount);
    const receiptReference = trimText(body.receiptPath ?? body.receiptUrl, 1000);
    const description = trimText(body.description, 500);
    const notes = trimText(body.notes, 1000);
    const receiptDateRaw = trimText(body.receiptDate, 20) ?? "";
    const today = new Date();
    const todayIso = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
      .toISOString()
      .slice(0, 10);
    const receiptDate = receiptDateRaw ? receiptDateRaw : todayIso;

    if (!workerId || !UUID_RE.test(workerId)) {
      return jsonError("Worker is required.", 400);
    }
    if (projectIdRaw && !projectId) {
      return jsonError("Selected project is invalid.", 400);
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_WORKER_RECEIPT_AMOUNT) {
      return jsonError("Valid receipt amount is required.", 400);
    }
    if (receiptDateRaw && !isValidIsoDate(receiptDateRaw)) {
      return jsonError("Receipt date is invalid.", 400);
    }
    const receiptPath = receiptReference
      ? normalizeWorkerReceiptUploadPath(receiptReference)
      : null;
    if (!receiptPath) {
      return jsonError("Receipt upload reference is invalid.", 400);
    }

    try {
      const { error } = await supabase.from("worker_receipts").insert({
        worker_id: workerId,
        worker_name: workerName || "Worker",
        project_id: projectId,
        expense_type: expenseType,
        vendor,
        amount,
        receipt_url: receiptPath,
        description,
        notes,
        receipt_date: receiptDate,
      });
      if (error) throw new Error(error.message ?? "Failed to create receipt upload.");
      return NextResponse.json({ ok: true });
    } catch (err) {
      // Log detailed error for debugging in Vercel function logs.
      // eslint-disable-next-line no-console
      console.error("[upload-receipt/submit] insert failed", {
        error: err instanceof Error ? err.message : String(err),
        workerId,
        projectId,
        amount,
        expenseType,
      });
      return jsonError("Receipt submission failed. Please try again.", 500);
    }
  } catch (e) {
    console.error("[upload-receipt/submit] unexpected failure", {
      message: e instanceof Error ? e.message : String(e),
    });
    return jsonError("Receipt submission failed. Please try again.", 500);
  }
}
