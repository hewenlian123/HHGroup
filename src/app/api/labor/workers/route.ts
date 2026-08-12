import { NextResponse } from "next/server";
import postgres from "postgres";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import {
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
  getServerSupabaseAdmin,
} from "@/lib/supabase-server";
import { insertWorker, type WorkerRow } from "@/lib/workers-db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

type WorkerCreateInput = {
  name: string;
  phone: string | null;
  trade: string | null;
  dailyRate: number;
  defaultOtRate: number;
  notes: string | null;
  status: "Active" | "Inactive";
};

function mapWorkerResponse(worker: WorkerRow) {
  return {
    ...worker,
    role: worker.trade,
    half_day_rate: worker.daily_rate,
    halfDayRate: worker.daily_rate,
    dailyRate: worker.daily_rate,
    status: worker.status === "Inactive" ? "inactive" : "active",
  };
}

function normalizeWorkerRow(row: Record<string, unknown>): WorkerRow {
  const status = row.status === "Inactive" || row.status === "inactive" ? "Inactive" : "Active";
  const dailyRate = Number(row.daily_rate ?? row.half_day_rate ?? 0) || 0;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    phone: row.phone == null ? null : String(row.phone),
    trade: row.trade == null ? (row.role == null ? null : String(row.role)) : String(row.trade),
    daily_rate: dailyRate,
    default_ot_rate: Number(row.default_ot_rate ?? 0) || 0,
    status,
    notes: row.notes == null ? null : String(row.notes),
    created_at: row.created_at == null ? "" : String(row.created_at),
  };
}

function quotedStatusFromConstraint(definitions: string[], input: WorkerCreateInput) {
  const values = new Set<string>();
  for (const definition of definitions) {
    for (const match of definition.matchAll(/'([^']+)'/g)) values.add(match[1]);
  }
  const upper = input.status;
  const lower = input.status === "Inactive" ? "inactive" : "active";
  if (values.has(lower)) return lower;
  if (values.has(upper)) return upper;
  return lower;
}

async function ensureInitialWorkerRateHistoryViaSql(
  sql: ReturnType<typeof postgres>,
  worker: WorkerRow,
  dailyRate: number
) {
  const historyColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'worker_rate_history'
  `;
  const columns = new Set(historyColumns.map((row) => row.column_name));
  if (
    !columns.has("worker_id") ||
    !columns.has("rate_type") ||
    !columns.has("daily_rate") ||
    !columns.has("effective_from")
  ) {
    return;
  }

  const existing = await sql`
    SELECT 1
    FROM public.worker_rate_history
    WHERE worker_id = ${worker.id}::uuid
      AND rate_type = 'daily'
    LIMIT 1
  `;
  if (existing.length > 0) return;

  const payload: Record<string, unknown> = {
    worker_id: worker.id,
    rate_type: "daily",
    daily_rate: dailyRate,
    effective_from: (worker.created_at || new Date().toISOString()).slice(0, 10),
  };
  if (columns.has("effective_to")) payload.effective_to = null;
  if (columns.has("notes")) payload.notes = "Initial daily rate";
  await sql`INSERT INTO public.worker_rate_history ${sql(payload as never, Object.keys(payload))}`;
}

async function insertWorkerViaDatabaseUrl(input: WorkerCreateInput): Promise<WorkerRow | null> {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return null;

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    const columnRows = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workers'
      ORDER BY ordinal_position
    `;
    const columns = new Set(columnRows.map((row) => row.column_name));
    if (!columns.has("name")) throw new Error("workers.name column is required.");

    const constraintRows = await sql<{ definition: string }[]>`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'workers'
        AND c.contype = 'c'
        AND c.conname ILIKE '%status%'
    `;

    const payload: Record<string, unknown> = { name: input.name };
    if (columns.has("phone")) payload.phone = input.phone;
    if (columns.has("trade")) payload.trade = input.trade;
    if (columns.has("role")) payload.role = input.trade;
    if (columns.has("daily_rate")) payload.daily_rate = input.dailyRate;
    if (columns.has("half_day_rate")) payload.half_day_rate = input.dailyRate;
    if (columns.has("default_ot_rate")) payload.default_ot_rate = input.defaultOtRate;
    if (columns.has("notes")) payload.notes = input.notes;
    if (columns.has("status")) {
      payload.status = quotedStatusFromConstraint(
        constraintRows.map((row) => row.definition),
        input
      );
    }

    const insertColumns = Object.keys(payload);
    const rows = await sql<Record<string, unknown>[]>`
      INSERT INTO public.workers ${sql(payload as never, insertColumns)}
      RETURNING *
    `;
    const worker = normalizeWorkerRow(rows[0] ?? {});
    await ensureInitialWorkerRateHistoryViaSql(sql, worker, input.dailyRate).catch(() => {});
    return worker;
  } finally {
    await sql.end();
  }
}

/**
 * GET: List all workers — query with admin client directly so UI always sees same data as DELETE/clear-data.
 */
export async function GET(req: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    const { data: rows, error } = await admin
      .from("workers")
      .select("id, name, role, phone, half_day_rate, status, notes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message ?? "Failed to load workers.");
    const workers = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name ?? "",
      role: r.role ?? null,
      phone: r.phone ?? null,
      half_day_rate: Number(r.half_day_rate) || 0,
      status: r.status ?? "active",
      notes: r.notes ?? null,
      created_at: r.created_at ?? "",
    }));
    return NextResponse.json(workers, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load workers.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * POST: Create a worker (uses admin client).
 */
export async function POST(req: Request) {
  const guard = await requireSupabaseOwnerOrAdmin(req);
  if (!guard.ok) return guard.response;

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name as string)?.trim() ?? "";
    if (!name) return NextResponse.json({ message: "Name is required." }, { status: 400 });
    const dailyRate =
      Number(body.daily_rate ?? body.dailyRate ?? body.half_day_rate ?? body.halfDayRate ?? 0) || 0;
    const input: WorkerCreateInput = {
      name,
      phone: (body.phone as string)?.trim() || null,
      trade: ((body.role ?? body.trade) as string)?.trim() || null,
      dailyRate,
      defaultOtRate: Number(body.default_ot_rate ?? body.defaultOtRate ?? 0) || 0,
      notes: (body.notes as string)?.trim() || null,
      status: body.status === "inactive" || body.status === "Inactive" ? "Inactive" : "Active",
    };
    try {
      const worker = await insertWorker(
        {
          name: input.name,
          phone: input.phone,
          trade: input.trade,
          daily_rate: input.dailyRate,
          default_ot_rate: input.defaultOtRate,
          notes: input.notes,
          status: input.status,
        },
        admin
      );
      return NextResponse.json(mapWorkerResponse(worker));
    } catch (error) {
      const worker = await insertWorkerViaDatabaseUrl(input);
      if (worker) return NextResponse.json(mapWorkerResponse(worker));
      throw error;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create worker.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
