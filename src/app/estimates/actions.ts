"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "./revalidate-estimate-paths";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  createEstimateRevisionWithClient,
  duplicateEstimateAsDraftWithClient,
} from "@/lib/estimates-db";
import { estimateActivityActorFromAuth } from "@/lib/estimate-activity";

type SupabaseActionError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type DuplicateEstimateActionResult = {
  ok: boolean;
  estimateId?: string;
  estimateNumber?: string;
  error?: string;
};

export type CreateEstimateRevisionActionResult = DuplicateEstimateActionResult & {
  revisionNumber?: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDuplicateEstimateError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/not found/i.test(message)) return "Source Estimate not found.";
  if (/details are incomplete/i.test(message)) {
    return "Source Estimate details are incomplete and cannot be copied.";
  }
  if (/customer relationship is no longer valid/i.test(message)) {
    return "The source customer relationship is no longer valid. Reselect the customer first.";
  }
  if (/payment schedule total.*cannot exceed Estimate final total/i.test(message)) {
    return "The source Payment Schedule exceeds the Estimate final total and cannot be copied.";
  }
  return "Could not copy Estimate.";
}

export async function duplicateEstimateAsDraftAction(
  sourceEstimateId: string
): Promise<DuplicateEstimateActionResult> {
  const auth = await requireSupabaseOwnerOrAdminServerAction();
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  const canonicalSourceId = sourceEstimateId.trim();
  if (!UUID_PATTERN.test(canonicalSourceId)) {
    return { ok: false, error: "Source Estimate not found." };
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) return { ok: false, error: "Database is not configured." };

  try {
    const duplicated = await duplicateEstimateAsDraftWithClient(
      admin,
      canonicalSourceId,
      estimateActivityActorFromAuth(auth.context)
    );
    revalidateEstimatePaths(canonicalSourceId);
    revalidateEstimatePaths(duplicated.estimateId);
    revalidatePath("/estimates");
    return {
      ok: true,
      estimateId: duplicated.estimateId,
      estimateNumber: duplicated.estimateNumber,
    };
  } catch (error) {
    return { ok: false, error: safeDuplicateEstimateError(error) };
  }
}

function safeCreateRevisionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/not found/i.test(message)) return "Source Estimate not found.";
  if (/only be created from an Approved, Rejected, or Converted/i.test(message)) {
    return "Create Revision is available only for an Approved, Rejected, or Converted Estimate.";
  }
  if (/latest revision/i.test(message)) {
    return "A newer revision already exists. Open the latest revision to continue.";
  }
  if (/customer relationship is no longer valid/i.test(message)) {
    return "The source customer relationship is no longer valid. Reselect the customer first.";
  }
  if (/payment schedule total.*cannot exceed Estimate final total/i.test(message)) {
    return "The source Payment Schedule exceeds the Estimate final total and cannot be revised.";
  }
  return "Could not create Estimate revision.";
}

export async function createEstimateRevisionAction(
  sourceEstimateId: string
): Promise<CreateEstimateRevisionActionResult> {
  const auth = await requireSupabaseOwnerOrAdminServerAction();
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  const canonicalSourceId = sourceEstimateId.trim();
  if (!UUID_PATTERN.test(canonicalSourceId)) {
    return { ok: false, error: "Source Estimate not found." };
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) return { ok: false, error: "Database is not configured." };

  try {
    const revision = await createEstimateRevisionWithClient(
      admin,
      canonicalSourceId,
      estimateActivityActorFromAuth(auth.context)
    );
    revalidateEstimatePaths(canonicalSourceId);
    revalidateEstimatePaths(revision.estimateId);
    revalidatePath("/estimates");
    return {
      ok: true,
      estimateId: revision.estimateId,
      estimateNumber: revision.estimateNumber,
      revisionNumber: revision.revisionNumber,
    };
  } catch (error) {
    return { ok: false, error: safeCreateRevisionError(error) };
  }
}

type DeleteEstimateStepName = "paymentScheduleItems" | "items" | "categories" | "meta" | "estimate";

type DeleteEstimateStepDiagnostic = {
  name: DeleteEstimateStepName;
  table: string;
  deletedRowCount: number;
  deletedRowIds: string[];
  error: SupabaseActionError | null;
  timedOut: boolean;
  durationMs: number;
};

export type DeleteEstimateDiagnostic = {
  estimateId: string;
  cleanupResults: DeleteEstimateStepDiagnostic[];
  deleteResultData: Array<{ id: string | null }>;
  deletedRowCount: number;
  deletedRowIds: string[];
  deleteError: SupabaseActionError | null;
  postDeleteResultData: { id: string | null } | null;
  postDeleteExists: boolean;
  postDeleteId: string | null;
  postDeleteError: SupabaseActionError | null;
};

function serializeSupabaseError(error: unknown): SupabaseActionError | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Partial<Record<keyof SupabaseActionError, unknown>>;
  const message =
    typeof e.message === "string" && e.message.trim()
      ? "Database operation failed."
      : "Estimate operation failed.";
  return {
    ...(typeof e.code === "string" ? { code: e.code } : {}),
    message,
  };
}

function logDeleteEstimateDiagnostic(
  level: "info" | "warn" | "error",
  diagnostic: DeleteEstimateDiagnostic
) {
  const message = "[deleteEstimateAction] estimate delete diagnostic";
  if (level === "error") {
    console.error(message, diagnostic);
  } else if (level === "warn") {
    console.warn(message, diagnostic);
  } else {
    console.info(message, diagnostic);
  }
}

const DELETE_QUERY_TIMEOUT_MS = 15_000;

function timeoutError(message: string): SupabaseActionError {
  return { code: "DELETE_TIMEOUT", message };
}

async function runTimedSupabaseQuery<T>(
  label: string,
  run: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>
): Promise<{
  data: T | null;
  error: SupabaseActionError | null;
  timedOut: boolean;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELETE_QUERY_TIMEOUT_MS);

  try {
    const { data, error } = await run(controller.signal);
    return {
      data,
      error: serializeSupabaseError(error),
      timedOut: false,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      data: null,
      error: aborted
        ? timeoutError(`${label} timed out after ${DELETE_QUERY_TIMEOUT_MS}ms.`)
        : (serializeSupabaseError(error) ?? {
            message: `${label} failed.`,
          }),
      timedOut: aborted,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function rowIds(rows: Array<Record<string, unknown>>, key: "id" | "estimate_id"): string[] {
  return rows.map((row) => String(row[key] ?? "")).filter(Boolean);
}

export async function deleteEstimateAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string; diagnostic?: DeleteEstimateDiagnostic }> {
  const auth = await requireSupabaseOwnerOrAdminServerAction();
  if (!auth.ok) return { ok: false, error: "Authentication required." };

  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string" || !estimateId) {
    return { ok: false, error: "Missing estimate." };
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "Database is not configured." };
  }

  const estimatePreflight = await runTimedSupabaseQuery<Record<string, unknown> | null>(
    "Checking estimate delete eligibility",
    (signal) =>
      admin
        .from("estimates")
        .select("id, status")
        .eq("id", estimateId)
        .abortSignal(signal)
        .maybeSingle()
  );
  if (estimatePreflight.error) {
    return { ok: false, error: "Could not verify estimate delete eligibility." };
  }
  const estimateStatus = String(estimatePreflight.data?.status ?? "");
  if (!estimatePreflight.data?.id) return { ok: false, error: "Estimate not found." };
  if (estimateStatus !== "Draft") {
    return {
      ok: false,
      error: `${estimateStatus || "Non-draft"} estimates cannot be deleted. Only disposable Draft estimates may be permanently deleted.`,
    };
  }

  const [projectDependency, snapshotDependency, scheduleDependencies] = await Promise.all([
    runTimedSupabaseQuery<Array<Record<string, unknown>>>("Checking linked projects", (signal) =>
      admin
        .from("projects")
        .select("id")
        .eq("source_estimate_id", estimateId)
        .limit(1)
        .abortSignal(signal)
    ),
    runTimedSupabaseQuery<Array<Record<string, unknown>>>("Checking estimate history", (signal) =>
      admin
        .from("estimate_snapshots")
        .select("id")
        .eq("estimate_id", estimateId)
        .limit(1)
        .abortSignal(signal)
    ),
    runTimedSupabaseQuery<Array<Record<string, unknown>>>(
      "Checking payment milestone dependencies",
      (signal) =>
        admin
          .from("estimate_payment_schedule_items")
          .select("id, status, invoice_id")
          .eq("estimate_id", estimateId)
          .abortSignal(signal)
    ),
  ]);
  if (projectDependency.error || snapshotDependency.error || scheduleDependencies.error) {
    return { ok: false, error: "Could not verify estimate dependencies." };
  }
  if ((projectDependency.data ?? []).length > 0) {
    return { ok: false, error: "This estimate is linked to a project and cannot be deleted." };
  }
  if ((snapshotDependency.data ?? []).length > 0) {
    return {
      ok: false,
      error: "This estimate has protected version history and cannot be deleted.",
    };
  }
  const protectedMilestone = (scheduleDependencies.data ?? []).find((row) => {
    const status = String(row.status ?? "draft");
    return Boolean(row.invoice_id) || status === "invoiced" || status === "paid";
  });
  if (protectedMilestone) {
    return {
      ok: false,
      error: "This estimate has an invoiced or paid payment milestone and cannot be deleted.",
    };
  }

  const diagnostic: DeleteEstimateDiagnostic = {
    estimateId,
    cleanupResults: [],
    deleteResultData: [],
    deletedRowCount: 0,
    deletedRowIds: [],
    deleteError: null,
    postDeleteResultData: null,
    postDeleteExists: false,
    postDeleteId: null,
    postDeleteError: null,
  };

  const cleanupSteps: Array<{
    name: DeleteEstimateStepName;
    table: string;
    select: "id" | "estimate_id";
  }> = [
    { name: "paymentScheduleItems", table: "estimate_payment_schedule_items", select: "id" },
    // Snapshot history is append-only and was already proven empty by the
    // dependency preflight above. Never issue a DELETE against that table.
    { name: "items", table: "estimate_items", select: "id" },
    { name: "categories", table: "estimate_categories", select: "estimate_id" },
    { name: "meta", table: "estimate_meta", select: "estimate_id" },
  ];

  for (const step of cleanupSteps) {
    const result = await runTimedSupabaseQuery<Array<Record<string, unknown>>>(
      `Deleting ${step.table}`,
      (signal) =>
        admin
          .from(step.table)
          .delete()
          .eq("estimate_id", estimateId)
          .select(step.select)
          .abortSignal(signal)
    );
    const rows = Array.isArray(result.data) ? result.data : [];
    const stepDiagnostic: DeleteEstimateStepDiagnostic = {
      name: step.name,
      table: step.table,
      deletedRowCount: rows.length,
      deletedRowIds: rowIds(rows, step.select),
      error: result.error,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
    };
    diagnostic.cleanupResults.push(stepDiagnostic);
    if (result.error) {
      logDeleteEstimateDiagnostic("error", diagnostic);
      return {
        ok: false,
        error: result.error.message || `Could not delete related estimate rows from ${step.table}.`,
        diagnostic,
      };
    }
  }

  const deleteResult = await runTimedSupabaseQuery<Array<Record<string, unknown>>>(
    "Deleting estimates",
    (signal) =>
      admin.from("estimates").delete().eq("id", estimateId).select("id").abortSignal(signal)
  );
  const deletedRows = Array.isArray(deleteResult.data) ? deleteResult.data : [];
  diagnostic.deleteResultData = deletedRows.map((row) => ({
    id: row.id != null ? String(row.id) : null,
  }));
  diagnostic.deletedRowCount = deletedRows.length;
  diagnostic.deletedRowIds = rowIds(deletedRows, "id");
  diagnostic.deleteError = deleteResult.error;
  diagnostic.cleanupResults.push({
    name: "estimate",
    table: "estimates",
    deletedRowCount: deletedRows.length,
    deletedRowIds: diagnostic.deletedRowIds,
    error: deleteResult.error,
    timedOut: deleteResult.timedOut,
    durationMs: deleteResult.durationMs,
  });

  if (deleteResult.error) {
    logDeleteEstimateDiagnostic("error", diagnostic);
    return {
      ok: false,
      error: deleteResult.error.message || "Could not delete estimate.",
      diagnostic,
    };
  }

  const postDeleteResult = await runTimedSupabaseQuery<Record<string, unknown> | null>(
    "Verifying estimate delete",
    (signal) =>
      admin.from("estimates").select("id").eq("id", estimateId).abortSignal(signal).maybeSingle()
  );
  const postDeleteRow = postDeleteResult.data;
  diagnostic.postDeleteError = postDeleteResult.error;
  diagnostic.postDeleteResultData =
    postDeleteRow?.id != null ? { id: String(postDeleteRow.id) } : null;
  diagnostic.postDeleteId = postDeleteRow?.id != null ? String(postDeleteRow.id) : null;
  diagnostic.postDeleteExists = Boolean(diagnostic.postDeleteId);

  if (diagnostic.postDeleteError) {
    logDeleteEstimateDiagnostic("error", diagnostic);
    return {
      ok: false,
      error: diagnostic.postDeleteError.message || "Could not verify estimate deletion.",
      diagnostic,
    };
  }
  if (deletedRows.length === 0) {
    logDeleteEstimateDiagnostic("warn", diagnostic);
    return {
      ok: false,
      error:
        "Estimate was not deleted. Please refresh and try again, or check server delete permissions.",
      diagnostic,
    };
  }
  if (diagnostic.postDeleteExists) {
    logDeleteEstimateDiagnostic("error", diagnostic);
    return {
      ok: false,
      error: "Estimate still exists after delete verification.",
      diagnostic,
    };
  }
  logDeleteEstimateDiagnostic("info", diagnostic);
  revalidatePath("/estimates");
  revalidateEstimatePaths(estimateId);
  return { ok: true, diagnostic };
}
