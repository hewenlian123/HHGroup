import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternal,
} from "@/lib/supabase-server";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

function apiError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return /schema cache|could not find the table|relation .* does not exist/i.test(e.message ?? "");
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternal();
  if (!supabase) return apiError(503, SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 500) || 500, 500));

  try {
    const [payments, workersRes, projectsRes] = await Promise.all([
      getWorkerPaymentsWithClient(supabase, { limit }),
      supabase.from("labor_workers").select("id,name").order("name").limit(1000),
      supabase.from("projects").select("id,name").order("name").limit(1000),
    ]);

    if (workersRes.error && !isMissingTableError(workersRes.error))
      throw new Error(workersRes.error.message);
    if (projectsRes.error && !isMissingTableError(projectsRes.error))
      throw new Error(projectsRes.error.message);

    return NextResponse.json(
      {
        ok: true,
        payments,
        workers: (workersRes.data ?? []) as Array<{ id: string; name: string }>,
        projects: (projectsRes.data ?? []) as Array<{ id: string; name: string }>,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load worker payments.";
    return apiError(500, message);
  }
}
