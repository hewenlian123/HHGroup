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

export type DeleteEstimateDiagnostic = {
  estimateId: string;
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
  const { data, error } = await admin.from("estimates").delete().eq("id", estimateId).select("id");
  const deletedRows = Array.isArray(data) ? (data as Array<{ id?: string | null }>) : [];
  const diagnostic: DeleteEstimateDiagnostic = {
    estimateId,
    deleteResultData: deletedRows.map((row) => ({ id: row.id != null ? String(row.id) : null })),
    deletedRowCount: deletedRows.length,
    deletedRowIds: deletedRows.map((row) => String(row.id ?? "")).filter(Boolean),
    deleteError: serializeSupabaseError(error),
    postDeleteResultData: null,
    postDeleteExists: false,
    postDeleteId: null,
    postDeleteError: null,
  };
  if (error) {
    logDeleteEstimateDiagnostic("error", diagnostic);
    return {
      ok: false,
      error: error.message || "Could not delete estimate.",
      diagnostic,
    };
  }

  const { data: postDeleteRow, error: postDeleteError } = await admin
    .from("estimates")
    .select("id")
    .eq("id", estimateId)
    .maybeSingle();
  diagnostic.postDeleteError = serializeSupabaseError(postDeleteError);
  diagnostic.postDeleteResultData =
    postDeleteRow?.id != null ? { id: String(postDeleteRow.id) } : null;
  diagnostic.postDeleteId = postDeleteRow?.id != null ? String(postDeleteRow.id) : null;
  diagnostic.postDeleteExists = Boolean(diagnostic.postDeleteId);

  if (postDeleteError) {
    logDeleteEstimateDiagnostic("error", diagnostic);
    return {
      ok: false,
      error: postDeleteError.message || "Could not verify estimate deletion.",
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
