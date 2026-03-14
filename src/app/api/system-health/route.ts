import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export type SystemHealthStatus = "ok" | "warning";

export type SystemHealthModule = {
  name: string;
  status: "ok" | "fail";
  message?: string;
};

const MODULES: { name: string; table: string }[] = [
  { name: "database", table: "projects" },
  { name: "projects", table: "projects" },
  { name: "labor", table: "labor_entries" },
  { name: "reimbursements", table: "worker_reimbursements" },
  { name: "expenses", table: "expenses" },
  { name: "worker_payments", table: "worker_payments" },
  { name: "invoices", table: "invoices" },
];

/**
 * GET: System health check.
 * Verifies each module with select id from table limit 1, then calls /api/schema-check.
 * Returns { status: "ok" | "warning", modules: [{ name, status }, ...], schemaMissing?: string[] }.
 * status === "warning" when any module fails or when schema-check returns error.
 */
export async function GET(request: Request) {
  const modules: SystemHealthModule[] = [];
  let status: SystemHealthStatus = "ok";

  const server = getServerSupabase();
  if (!server) {
    for (const m of MODULES) {
      modules.push({ name: m.name, status: "fail", message: "Not configured" });
    }
    return NextResponse.json({ status: "warning", modules });
  }

  const tableToNames = new Map<string, string[]>();
  for (const { name, table } of MODULES) {
    const list = tableToNames.get(table) ?? [];
    list.push(name);
    tableToNames.set(table, list);
  }
  const uniqueTables = Array.from(tableToNames.entries());

  for (const [table, names] of uniqueTables) {
    let ok = false;
    let message: string | undefined;
    try {
      const { error } = await server.from(table).select("id").limit(1).maybeSingle();
      if (error) {
        message = error.message ?? "Query failed";
        status = "warning";
      } else {
        ok = true;
      }
    } catch (e) {
      message = e instanceof Error ? e.message : "Unknown error";
      status = "warning";
    }
    for (const name of names) {
      modules.push(ok ? { name, status: "ok" } : { name, status: "fail", message });
    }
  }

  // Call schema-check; if it returns error, set status to warning and include missing fields
  let schemaMissing: string[] | undefined;
  try {
    const origin = new URL(request.url).origin;
    const schemaRes = await fetch(`${origin}/api/schema-check`, { cache: "no-store" });
    const schemaData = (await schemaRes.json().catch(() => ({}))) as { status?: string; missing?: string[] };
    if (schemaData.status === "error" && Array.isArray(schemaData.missing) && schemaData.missing.length > 0) {
      status = "warning";
      schemaMissing = schemaData.missing;
    }
  } catch {
    status = "warning";
    schemaMissing = [];
  }

  const body: { status: SystemHealthStatus; modules: SystemHealthModule[]; schemaMissing?: string[] } = {
    status,
    modules,
  };
  if (schemaMissing !== undefined) body.schemaMissing = schemaMissing;

  return NextResponse.json(body);
}
