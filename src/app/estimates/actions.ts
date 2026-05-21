"use server";

import { revalidatePath } from "next/cache";
import { revalidateEstimatePaths } from "./revalidate-estimate-paths";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

type SupabaseActionError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type DeleteEstimateStepName =
  | "paymentScheduleItems"
  | "snapshots"
  | "items"
  | "categories"
  | "meta"
  | "estimate";

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
  return {
    ...(typeof e.code === "string" ? { code: e.code } : {}),
    ...(typeof e.message === "string" ? { message: e.message } : {}),
    ...(typeof e.details === "string" ? { details: e.details } : {}),
    ...(typeof e.hint === "string" ? { hint: e.hint } : {}),
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
            message: error instanceof Error ? error.message : `${label} failed.`,
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
  const estimateId = formData.get("estimateId");
  if (typeof estimateId !== "string" || !estimateId) {
    return { ok: false, error: "Missing estimate." };
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "Database is not configured." };
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
    { name: "snapshots", table: "estimate_snapshots", select: "id" },
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
