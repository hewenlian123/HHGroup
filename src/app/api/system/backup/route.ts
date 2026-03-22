/**
 * /api/system/backup
 *
 * POST — Create a new JSON backup of all critical tables.
 *        Writes to <project-root>/backups/database/backup-YYYY-MM-DD.json
 *        Logs result to System Logs.
 *        Returns { ok, message, filename, date, sizeBytes, tableErrors? }
 *
 * GET  — List existing backup files.
 *        Returns { ok, backups: BackupListItem[] }
 *
 * Note: file-system writes work in local development. On read-only platforms
 * (Vercel, etc.) the POST will return a clear error; the data export JSON is
 * still included in the response body so callers can save it client-side.
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { addSystemLog } from "@/lib/system-log-store";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── tables to back up ────────────────────────────────────────────────────────

const TABLES = [
  "projects",
  "workers",
  "worker_receipts",
  "worker_reimbursements",
  "labor_entries",
  "expenses",
  "expense_lines",
  "invoices",
  "payments_received",
] as const;

type TableName = (typeof TABLES)[number];

// ── types ─────────────────────────────────────────────────────────────────────

export type BackupListItem = {
  filename: string;
  date: string;
  sizeBytes: number;
  createdAt: string;
};

export type BackupDocument = {
  timestamp: string;
  tables: Partial<Record<TableName, unknown[]>>;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function backupDir(): string {
  return path.join(process.cwd(), "backups", "database");
}

function ensureDir(): void {
  const dir = backupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── POST — create backup ──────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  const c = getServerSupabase();
  if (!c) {
    addSystemLog({
      module: "Backup",
      type: "Error",
      message: "Backup failed: Supabase not configured",
    });
    return NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 500 });
  }

  const now = new Date();
  const dateStr = todayStr();
  const filename = `backup-${dateStr}.json`;

  // ── fetch all tables ────────────────────────────────────────────────────────
  const tables: Partial<Record<TableName, unknown[]>> = {};
  const tableErrors: string[] = [];

  for (const table of TABLES) {
    try {
      const { data, error } = await c.from(table).select("*");
      if (error) {
        tableErrors.push(`${table}: ${error.message}`);
        tables[table] = [];
      } else {
        tables[table] = data ?? [];
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      tableErrors.push(`${table}: ${msg}`);
      tables[table] = [];
    }
  }

  const doc: BackupDocument = { timestamp: now.toISOString(), tables };
  const json = JSON.stringify(doc, null, 2);
  const sizeBytes = Buffer.byteLength(json, "utf-8");

  // ── write file ──────────────────────────────────────────────────────────────
  let saved = false;
  let saveError: string | null = null;

  try {
    ensureDir();
    fs.writeFileSync(path.join(backupDir(), filename), json, "utf-8");
    saved = true;
  } catch (e) {
    saveError = e instanceof Error ? e.message : "Write failed";
  }

  // ── log outcome ─────────────────────────────────────────────────────────────
  if (saved && tableErrors.length === 0) {
    addSystemLog({
      module: "Backup",
      type: "Info",
      message: `Backup created: ${filename} — ${(sizeBytes / 1024).toFixed(1)} KB, ${TABLES.length} tables`,
    });
  } else {
    if (saveError) {
      addSystemLog({
        module: "Backup",
        type: "Error",
        message: `Backup write failed: ${saveError}. Data was fetched (${(sizeBytes / 1024).toFixed(1)} KB) but not saved to disk.`,
      });
    }
    if (tableErrors.length) {
      addSystemLog({
        module: "Backup",
        type: "Warning",
        message: `Backup table errors: ${tableErrors.join("; ")}`,
      });
    }
  }

  return NextResponse.json({
    ok: saved,
    message: saved
      ? "Backup created"
      : `Backup data exported (filesystem write failed: ${saveError})`,
    filename,
    date: dateStr,
    sizeBytes,
    ...(tableErrors.length ? { tableErrors } : {}),
    // Always return the data so callers can download it even when disk write fails
    data: doc,
  });
}

// ── GET — list backups ────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const dir = backupDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ ok: true, backups: [] });
    }

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort()
      .reverse(); // newest first

    const backups: BackupListItem[] = files.map((filename) => {
      const filePath = path.join(dir, filename);
      const stats = fs.statSync(filePath);
      const match = filename.match(/backup-(\d{4}-\d{2}-\d{2})\.json/);
      return {
        filename,
        date: match ? match[1] : filename,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    });

    return NextResponse.json({ ok: true, backups });
  } catch (e) {
    return NextResponse.json(
      { ok: false, backups: [], error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
