/**
 * GET /api/system/integrity
 *
 * Data integrity checks for stale test projects on the System Health page.
 */

import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { safeErrorMessage } from "@/lib/system-response-safety";
import postgres from "postgres";

export const dynamic = "force-dynamic";

/** Only very specific test terms; no generic words like "Test", "Example", or "Demo". */
const TEST_KEYWORDS = ["Workflow Test", "Test Worker", "Test Project", "Test Vendor"];

/** Known real projects to exclude from stale test data check and cleanup. */
const WHITELIST_PROJECT_IDS = ["9d14a300-a682-498a-9e5e-3bd4a7e070c4"];

export type IntegrityCheck = {
  ok: boolean;
  count: number;
  ids?: string[];
};

export type DataIntegrityResult = {
  ok: boolean;
  staleTestData: {
    projects: IntegrityCheck;
  };
  errors?: string[];
};

export async function GET(request: Request): Promise<NextResponse<DataIntegrityResult>> {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response as NextResponse<DataIntegrityResult>;

  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json({
      ok: true,
      staleTestData: { projects: { ok: true, count: 0 } },
      errors: [
        "Data Integrity requires SUPABASE_DATABASE_URL or DATABASE_URL in .env.local. Add the direct PostgreSQL connection string from Supabase → Project Settings → Database → Connection string (URI).",
      ],
    });
  }

  const errors: string[] = [];

  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    let staleProjectIds: string[] = [];

    try {
      for (const keyword of TEST_KEYWORDS) {
        const pattern = `\\m${keyword}\\M`;
        const rows = await sql`
          SELECT id FROM public.projects
          WHERE name ~* ${pattern}
        `;
        (rows as unknown as { id: string }[]).forEach((row) => staleProjectIds.push(row.id));
      }
      staleProjectIds = [...new Set(staleProjectIds)].filter(
        (id) => !WHITELIST_PROJECT_IDS.includes(id)
      );
    } catch (error) {
      errors.push(`Stale projects: ${safeErrorMessage(error)}`);
    } finally {
      await sql.end();
    }

    const staleProjects: IntegrityCheck = {
      ok: staleProjectIds.length === 0,
      count: staleProjectIds.length,
      ids: staleProjectIds,
    };

    return NextResponse.json({
      ok: errors.length === 0 && staleProjects.count === 0,
      staleTestData: { projects: staleProjects },
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        staleTestData: { projects: { ok: false, count: 0 } },
        errors: [safeErrorMessage(error)],
      },
      { status: 500 }
    );
  }
}
