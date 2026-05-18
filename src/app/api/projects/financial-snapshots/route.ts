import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  getProjectFinancialSnapshotComparison,
  type ProjectFinancialSnapshotComparison,
} from "@/lib/financial/project-financial-snapshot-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

const MAX_PROJECT_IDS = 120;
const SNAPSHOT_BATCH_CONCURRENCY = 4;

type ProjectSnapshotBatchItem =
  | { id: string; ok: true; comparison: ProjectFinancialSnapshotComparison }
  | { id: string; ok: false; message: string };

function parseProjectIds(request: Request): string[] {
  const url = new URL(request.url);
  const rawIds = [
    ...url.searchParams.getAll("id"),
    ...(url.searchParams.get("ids") ?? "").split(","),
  ];
  return [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_PROJECT_IDS);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: NO_CACHE_HEADERS });
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const ids = parseProjectIds(request);
  if (ids.length === 0) return jsonError(400, "Missing project ids.");

  const results = await mapWithConcurrency<string, ProjectSnapshotBatchItem>(
    ids,
    SNAPSHOT_BATCH_CONCURRENCY,
    async (id) => {
      try {
        const comparison = await getProjectFinancialSnapshotComparison(id);
        return { id, ok: true, comparison };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load project financial snapshot.";
        return { id, ok: false, message };
      }
    }
  );

  return NextResponse.json({ ok: true, results }, { headers: NO_CACHE_HEADERS });
}
