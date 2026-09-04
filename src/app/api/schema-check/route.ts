import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { runSchemaCheck } from "@/lib/schema-check";

export const dynamic = "force-dynamic";

/**
 * GET /api/schema-check
 * Verifies required database schema exists.
 * Returns { status: "ok", missing: [] } or { status: "error", missing: ["expenses.account_id", ...] }.
 */
function isSafeIdentifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const requestedTable = searchParams.get("table")?.trim() ?? "";
  const requestedColumn = searchParams.get("column")?.trim() ?? "";
  const singleCheck =
    requestedTable !== "" &&
    isSafeIdentifier(requestedTable) &&
    (requestedColumn === "" || isSafeIdentifier(requestedColumn));

  const result = await runSchemaCheck(
    singleCheck ? { table: requestedTable, column: requestedColumn || undefined } : undefined
  );
  return NextResponse.json(result.body, { status: result.status });
}
