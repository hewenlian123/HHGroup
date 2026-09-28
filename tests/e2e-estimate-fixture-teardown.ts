import postgres from "postgres";

import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteLocalEstimateFixtureGraphs(
  estimateIds: readonly string[]
): Promise<void> {
  const ids = Array.from(new Set(estimateIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return;

  const invalidId = ids.find((id) => !UUID_PATTERN.test(id));
  if (invalidId) {
    throw new Error("Estimate fixture teardown requires UUID estimate ids.");
  }

  const databaseUrl =
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    LOCAL_DATABASE_URL;

  assertEstimateCertificationLocalOnly({
    baseURL: process.env.E2E_BASE_URL?.trim() || "http://localhost:3001",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    databaseUrl,
  });

  const sql = postgres(databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 2,
    max: 1,
    onnotice: () => undefined,
    prepare: false,
  });

  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(
        "delete from public.estimate_snapshots where estimate_id = any($1::uuid[])",
        [ids]
      );
      await transaction.unsafe("delete from public.estimates where id = any($1::uuid[])", [ids]);

      const remainingSnapshots = await transaction.unsafe<{ estimate_id: string }[]>(
        "select estimate_id from public.estimate_snapshots where estimate_id = any($1::uuid[])",
        [ids]
      );
      const remainingEstimates = await transaction.unsafe<{ id: string }[]>(
        "select id from public.estimates where id = any($1::uuid[])",
        [ids]
      );

      if (remainingSnapshots.length > 0 || remainingEstimates.length > 0) {
        throw new Error(
          `Estimate fixture teardown left residue: ${remainingSnapshots.length} snapshot(s), ${remainingEstimates.length} estimate(s).`
        );
      }
    });
  } finally {
    await sql.end();
  }
}
