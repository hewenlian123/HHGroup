import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import {
  buildSystemIntegrityScanReport,
  type SystemIntegrityReadClient,
} from "@/lib/system-integrity-scan";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return NextResponse.json(
      {
        status: "fail",
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: 1,
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
        },
        sections: [
          {
            id: "scanner-read-safety",
            title: "Scanner Read Safety",
            status: "fail",
            issues: [
              {
                severity: "critical",
                category: "production_safety",
                table: "supabase",
                id: "supabase:not-configured",
                message: "Supabase server client is not configured.",
                evidence: {},
                recommendedAction: "Set server Supabase environment variables.",
                autoFixAvailable: false,
              },
            ],
          },
        ],
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const report = await buildSystemIntegrityScanReport(
      supabase as unknown as SystemIntegrityReadClient
    );
    return NextResponse.json(report, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = safeErrorMessage(error, "System integrity scan failed.");
    console.error("[system-integrity-scan]", message);
    return NextResponse.json(
      {
        status: "fail",
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: 1,
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
        },
        sections: [
          {
            id: "scanner-read-safety",
            title: "Scanner Read Safety",
            status: "fail",
            issues: [
              {
                severity: "critical",
                category: "production_safety",
                table: "system_integrity_scan",
                id: "system-integrity-scan:exception",
                message,
                evidence: {},
                recommendedAction: "Inspect server logs and retry the read-only scanner.",
                autoFixAvailable: false,
              },
            ],
          },
        ],
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
