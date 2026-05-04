import { NextResponse } from "next/server";

import { getServerSupabase, getServerSupabaseAdmin } from "@/lib/supabase-server";

/** Same UUID as `tests/reimbursement-flow-visual-helpers.ts` — diagnostic only. */
const E2E_REIMBURSEMENT_VISUAL_WORKER_ID = "88888888-8888-8888-8888-888888888888";

function hostFromEnvUrl(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    return new URL(t).host;
  } catch {
    return "(unparseable NEXT_PUBLIC_SUPABASE_URL)";
  }
}

/**
 * Non-production diagnostic: same Supabase resolution as `GET /api/upload-receipt/options`,
 * plus counts and visibility of the E2E reimbursement worker row.
 *
 * Route lives under `api/diag/` (not `api/_diag/`) — Next.js treats `_folders` as private and
 * does not expose them in the URL tree.
 *
 * Optional local `next start`: set `E2E_DIAG_UPLOAD_RECEIPT_SUPABASE=1` when NODE_ENV=production.
 */
export async function GET() {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.E2E_DIAG_UPLOAD_RECEIPT_SUPABASE === "1";
  if (!allow) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const urlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const admin = getServerSupabaseAdmin();
  const fallback = getServerSupabase();
  /** Mirrors `upload-receipt/options/route.ts`. */
  const optionsRouteClient = admin ?? fallback;

  const resolvedWith =
    admin != null ? "getServerSupabaseAdmin" : fallback != null ? "getServerSupabase" : "none";

  let workersCountOptionsClient = -1;
  let workersQueryErrorOptionsClient: string | null = null;
  let e2eWorkerVisibleOptionsClient = false;

  /** Same query shape as GET /api/upload-receipt/options — list workers for comparison with maybeSingle row. */
  let workersListCount = -1;
  let workersListContains8888 = false;
  let workersListFirstFewIds: string[] = [];
  let workersListLastFewIds: string[] = [];
  let workersListQueryError: string | null = null;
  let e2eRowHasData = false;
  let e2eRowId: string | null = null;
  let e2eRowName: string | null = null;
  let e2eRowErrorCode: string | null = null;
  let e2eRowErrorMessage: string | null = null;

  if (optionsRouteClient) {
    const countRes = await optionsRouteClient
      .from("workers")
      .select("id", { count: "exact", head: true });
    workersCountOptionsClient = countRes.count ?? -1;
    workersQueryErrorOptionsClient = countRes.error?.message ?? null;

    const listRes = await optionsRouteClient.from("workers").select("id, name").order("name");
    const listRows = (listRes.data ?? []) as Array<{ id: string; name: string | null }>;
    workersListCount = listRows.length;
    workersListQueryError = listRes.error?.message ?? null;
    if (listRes.error && !workersQueryErrorOptionsClient) {
      workersQueryErrorOptionsClient = listRes.error.message;
    }
    const listIds = listRows.map((r) => String(r.id ?? ""));
    workersListContains8888 = listIds.some(
      (id) => id.toLowerCase() === E2E_REIMBURSEMENT_VISUAL_WORKER_ID.toLowerCase()
    );
    workersListFirstFewIds = listIds.slice(0, 5);
    workersListLastFewIds = listIds.slice(Math.max(0, listIds.length - 5));

    const e2eRow = await optionsRouteClient
      .from("workers")
      .select("id, name")
      .eq("id", E2E_REIMBURSEMENT_VISUAL_WORKER_ID)
      .maybeSingle();
    e2eRowHasData = e2eRow.data != null;
    const row = e2eRow.data as { id?: string; name?: string | null } | null;
    e2eRowId = row?.id != null ? String(row.id) : null;
    e2eRowName = row?.name != null ? String(row.name) : null;
    e2eRowErrorCode = e2eRow.error?.code != null ? String(e2eRow.error.code) : null;
    e2eRowErrorMessage = e2eRow.error?.message ?? null;
    e2eWorkerVisibleOptionsClient = Boolean(row?.id);
    if (e2eRow.error && !workersQueryErrorOptionsClient) {
      workersQueryErrorOptionsClient = e2eRow.error.message;
    }
  }

  let workersCountAdminOnly: number | null = null;
  let e2eWorkerVisibleAdminOnly: boolean | null = null;
  let adminClientUnavailableReason: string | null = null;

  if (admin) {
    const countRes = await admin.from("workers").select("id", { count: "exact", head: true });
    workersCountAdminOnly = countRes.count ?? -1;
    const e2eRow = await admin
      .from("workers")
      .select("id")
      .eq("id", E2E_REIMBURSEMENT_VISUAL_WORKER_ID)
      .maybeSingle();
    e2eWorkerVisibleAdminOnly = Boolean(e2eRow.data?.id);
  } else {
    adminClientUnavailableReason = !urlEnv
      ? "missing NEXT_PUBLIC_SUPABASE_URL"
      : !hasServiceRoleKey
        ? "missing SUPABASE_SERVICE_ROLE_KEY (getServerSupabaseAdmin returns null)"
        : "unknown";
  }

  const body = {
    note: "Diagnostic only; mirrors upload-receipt/options Supabase client. Blocked when NODE_ENV=production unless E2E_DIAG_UPLOAD_RECEIPT_SUPABASE=1.",
    optionsRouteClientResolved: optionsRouteClient != null,
    optionsRouteClientMissingReason:
      optionsRouteClient != null
        ? null
        : !urlEnv
          ? "NEXT_PUBLIC_SUPABASE_URL unset — same as upload-receipt/options 503"
          : !hasAnonKey && !hasServiceRoleKey
            ? "Need NEXT_PUBLIC_SUPABASE_ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY"
            : "unknown",
    nodeEnv: process.env.NODE_ENV ?? "(unset)",
    nextPublicSupabaseHost: hostFromEnvUrl(urlEnv),
    hasNextPublicSupabaseUrl: Boolean(urlEnv),
    hasAnonKey,
    hasServiceRoleKey,
    uploadReceiptOptionsResolvedWith: resolvedWith,
    workersCountViaOptionsRouteClient: workersCountOptionsClient,
    e2eWorker8888VisibleViaOptionsRouteClient: e2eWorkerVisibleOptionsClient,
    e2eRowHasData,
    e2eRowId,
    e2eRowName,
    e2eRowErrorCode,
    e2eRowErrorMessage,
    workersListCount,
    workersListContains8888,
    workersListFirstFewIds,
    workersListLastFewIds,
    workersListQueryError,
    workersQueryErrorViaOptionsRouteClient: workersQueryErrorOptionsClient,
    workersCountViaAdminClient: workersCountAdminOnly,
    e2eWorker8888VisibleViaAdminClient: e2eWorkerVisibleAdminOnly,
    adminClientUnavailableReason,
  };

  return NextResponse.json(body);
}
