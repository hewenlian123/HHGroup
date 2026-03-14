import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TABLES = [
  "projects",
  "workers",
  "labor_entries",
  "worker_reimbursements",
  "expenses",
  "invoices",
  "worker_payments",
] as const;

type Metrics = {
  projects: number;
  workers: number;
  labor_entries: number;
  reimbursements: number;
  expenses: number;
  invoices: number;
  worker_payments: number;
};

/**
 * GET: Database row counts for core tables.
 * Returns { projects, workers, labor_entries, reimbursements, expenses, invoices, worker_payments }.
 */
export async function GET() {
  const server = getServerSupabase();
  if (!server) {
    return NextResponse.json(
      { message: "Supabase not configured" },
      { status: 500 }
    );
  }

  const metrics: Record<string, number> = {
    projects: 0,
    workers: 0,
    labor_entries: 0,
    reimbursements: 0,
    expenses: 0,
    invoices: 0,
    worker_payments: 0,
  };

  const keyMap: Record<(typeof TABLES)[number], keyof Metrics> = {
    projects: "projects",
    workers: "workers",
    labor_entries: "labor_entries",
    worker_reimbursements: "reimbursements",
    expenses: "expenses",
    invoices: "invoices",
    worker_payments: "worker_payments",
  };

  for (const table of TABLES) {
    try {
      const { count } = await server
        .from(table)
        .select("*", { count: "exact", head: true });
      const key = keyMap[table];
      metrics[key] = typeof count === "number" ? count : 0;
    } catch {
      metrics[keyMap[table]] = 0;
    }
  }

  return NextResponse.json(metrics as Metrics);
}
