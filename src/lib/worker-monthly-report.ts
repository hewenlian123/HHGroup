/**
 * Worker monthly report — read-only aggregation.
 *
 * Column lists match production public.* (verified via information_schema):
 * - labor_entries: work_date, cost_amount, project_id, worker_id
 * - worker_invoices: created_at, amount, project_id, worker_id
 * - labor_invoices: invoice_date, amount, status, project_splits, worker_id
 * - worker_reimbursements: created_at, amount, project_id, worker_id
 * - worker_advances: advance_date, amount, project_id, worker_id
 * - worker_payments: payment_date, amount, project_id, worker_id
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase-server";

export type WorkerMonthlyReportRowType =
  | "Labor"
  | "Reimbursement"
  | "Invoice"
  | "Advance"
  | "Payment";

export type WorkerMonthlyReportRow = {
  id: string;
  date: string;
  type: WorkerMonthlyReportRowType;
  projectLabel: string;
  amount: number;
  sortKey: string;
};

export type WorkerMonthlyReportSummary = {
  earned: number;
  reimbursements: number;
  totalOwed: number;
  paid: number;
  balance: number;
};

export type WorkerMonthlyReportResult = {
  workerName: string;
  monthLabel: string;
  rows: WorkerMonthlyReportRow[];
  summary: WorkerMonthlyReportSummary;
  supabaseConfigured: boolean;
  loadError: string | null;
};

const YM_RE = /^(\d{4})-(\d{2})$/;

export function parseMonthYm(input: string | undefined | null): string {
  if (input && YM_RE.test(input.trim())) return input.trim();
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthRangeUtc(ym: string): {
  start: string;
  nextStart: string;
  tStart: string;
  tNext: string;
} {
  const m = ym.match(YM_RE);
  if (!m) throw new Error("Invalid month");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error("Invalid month");
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const nextStart = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
  return {
    start,
    nextStart,
    tStart: `${start}T00:00:00.000Z`,
    tNext: `${nextStart}T00:00:00.000Z`,
  };
}

function monthHeading(ym: string): string {
  const m = ym.match(YM_RE);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

type Split = { projectId?: string; project_id?: string };

function laborInvoiceProjectLabel(splits: unknown, nameByProject: Map<string, string>): string {
  const arr = Array.isArray(splits) ? splits : [];
  const ids = arr
    .map((s) => (s as Split).projectId ?? (s as Split).project_id ?? "")
    .filter(Boolean);
  if (ids.length === 0) return "—";
  if (ids.length === 1) {
    const n = nameByProject.get(ids[0]);
    return n && n.trim() ? n : "—";
  }
  return "Multiple projects";
}

async function loadProjectNames(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const { data, error } = await admin.from("projects").select("id, name").in("id", uniq);
  if (error || !data) return map;
  for (const r of data as { id: string; name: string | null }[]) {
    if (r?.id) map.set(String(r.id), String(r.name ?? "").trim());
  }
  return map;
}

export async function getWorkerMonthlyReport(
  workerId: string,
  monthYm: string
): Promise<WorkerMonthlyReportResult> {
  const admin = getServerSupabase();
  if (!admin) {
    return {
      workerName: "",
      monthLabel: monthHeading(monthYm),
      rows: [],
      summary: { earned: 0, reimbursements: 0, totalOwed: 0, paid: 0, balance: 0 },
      supabaseConfigured: false,
      loadError: "Supabase is not configured.",
    };
  }

  let range: { start: string; nextStart: string; tStart: string; tNext: string };
  try {
    range = monthRangeUtc(monthYm);
  } catch {
    const fallback = parseMonthYm(null);
    range = monthRangeUtc(fallback);
  }

  const wid = workerId.trim();
  if (!wid) {
    return {
      workerName: "",
      monthLabel: monthHeading(monthYm),
      rows: [],
      summary: { earned: 0, reimbursements: 0, totalOwed: 0, paid: 0, balance: 0 },
      supabaseConfigured: true,
      loadError: "Missing worker id.",
    };
  }

  const [workerRes, laborRes, reimbRes, wiRes, liRes, advRes, payRes] = await Promise.all([
    admin.from("workers").select("id, name").eq("id", wid).maybeSingle(),
    admin
      .from("labor_entries")
      .select("id, project_id, work_date, cost_amount")
      .eq("worker_id", wid)
      .gte("work_date", range.start)
      .lt("work_date", range.nextStart),
    admin
      .from("worker_reimbursements")
      .select("id, project_id, amount, created_at")
      .eq("worker_id", wid)
      .gte("created_at", range.tStart)
      .lt("created_at", range.tNext),
    admin
      .from("worker_invoices")
      .select("id, project_id, amount, created_at")
      .eq("worker_id", wid)
      .gte("created_at", range.tStart)
      .lt("created_at", range.tNext),
    admin
      .from("labor_invoices")
      .select("id, invoice_date, amount, status, project_splits")
      .eq("worker_id", wid)
      .gte("invoice_date", range.start)
      .lt("invoice_date", range.nextStart),
    admin
      .from("worker_advances")
      .select("id, project_id, amount, advance_date")
      .eq("worker_id", wid)
      .gte("advance_date", range.start)
      .lt("advance_date", range.nextStart),
    admin
      .from("worker_payments")
      .select("id, project_id, amount, payment_date")
      .eq("worker_id", wid)
      .gte("payment_date", range.start)
      .lt("payment_date", range.nextStart),
  ]);

  const firstErr =
    workerRes.error?.message ??
    laborRes.error?.message ??
    reimbRes.error?.message ??
    wiRes.error?.message ??
    liRes.error?.message ??
    advRes.error?.message ??
    payRes.error?.message ??
    null;

  const workerName = String((workerRes.data as { name?: string } | null)?.name ?? "").trim();

  const laborRows = (laborRes.data ?? []) as {
    id: string;
    project_id: string | null;
    work_date: string;
    cost_amount: unknown;
  }[];
  const reimbRows = (reimbRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    created_at: string;
  }[];
  const wiRows = (wiRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    created_at: string;
  }[];
  const liRows = (liRes.data ?? []) as {
    id: string;
    invoice_date: string;
    amount: unknown;
    status: string | null;
    project_splits: unknown;
  }[];
  const advRows = (advRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    advance_date: string;
  }[];
  const payRows = (payRes.data ?? []) as {
    id: string;
    project_id: string | null;
    amount: unknown;
    payment_date: string;
  }[];

  const projectIds: string[] = [];
  for (const r of laborRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of reimbRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of wiRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of advRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of payRows) if (r.project_id) projectIds.push(String(r.project_id));
  for (const r of liRows) {
    const splits = Array.isArray(r.project_splits) ? r.project_splits : [];
    for (const s of splits) {
      const pid = (s as Split).projectId ?? (s as Split).project_id;
      if (pid) projectIds.push(String(pid));
    }
  }

  const nameByProject = await loadProjectNames(admin, projectIds);

  const merged: WorkerMonthlyReportRow[] = [];

  for (const r of laborRows) {
    const amt = Math.abs(Number(r.cost_amount) || 0);
    const d = String(r.work_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `labor-${r.id}`,
      date: d,
      type: "Labor",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:00|0|${r.id}`,
    });
  }

  for (const r of reimbRows) {
    const amt = Math.abs(Number(r.amount) || 0);
    const d = String(r.created_at ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `reimb-${r.id}`,
      date: d,
      type: "Reimbursement",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:01|1|${r.id}`,
    });
  }

  for (const r of wiRows) {
    const amt = Math.abs(Number(r.amount) || 0);
    const d = String(r.created_at ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `winv-${r.id}`,
      date: d,
      type: "Invoice",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:02|2|${r.id}`,
    });
  }

  for (const r of liRows) {
    const st = String(r.status ?? "").toLowerCase();
    if (st === "void") continue;
    const amt = Math.abs(Number(r.amount) || 0);
    const d = String(r.invoice_date ?? "").slice(0, 10);
    merged.push({
      id: `linv-${r.id}`,
      date: d,
      type: "Invoice",
      projectLabel: laborInvoiceProjectLabel(r.project_splits, nameByProject),
      amount: amt,
      sortKey: `${d}T00:00:03|3|${r.id}`,
    });
  }

  for (const r of advRows) {
    const raw = Number(r.amount) || 0;
    const amt = -Math.abs(raw);
    const d = String(r.advance_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `adv-${r.id}`,
      date: d,
      type: "Advance",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:04|4|${r.id}`,
    });
  }

  for (const r of payRows) {
    const raw = Number(r.amount) || 0;
    const amt = -Math.abs(raw);
    const d = String(r.payment_date ?? "").slice(0, 10);
    const pid = r.project_id ? String(r.project_id) : null;
    merged.push({
      id: `pay-${r.id}`,
      date: d,
      type: "Payment",
      projectLabel: pid ? nameByProject.get(pid) || "—" : "—",
      amount: amt,
      sortKey: `${d}T00:00:05|5|${r.id}`,
    });
  }

  merged.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  let laborSum = 0;
  for (const r of laborRows) laborSum += Math.abs(Number(r.cost_amount) || 0);

  let wiSum = 0;
  for (const r of wiRows) wiSum += Math.abs(Number(r.amount) || 0);

  let liSum = 0;
  for (const r of liRows) {
    if (String(r.status ?? "").toLowerCase() === "void") continue;
    liSum += Math.abs(Number(r.amount) || 0);
  }

  const earned = laborSum + wiSum + liSum;

  let reimbSum = 0;
  for (const r of reimbRows) reimbSum += Math.abs(Number(r.amount) || 0);

  const totalOwed = earned + reimbSum;

  let paySum = 0;
  for (const r of payRows) paySum += Math.abs(Number(r.amount) || 0);

  let advSum = 0;
  for (const r of advRows) advSum += Math.abs(Number(r.amount) || 0);

  const paid = paySum + advSum;
  const balance = totalOwed - paid;

  return {
    workerName,
    monthLabel: monthHeading(monthYm),
    rows: merged,
    summary: {
      earned,
      reimbursements: reimbSum,
      totalOwed,
      paid,
      balance,
    },
    supabaseConfigured: true,
    loadError: firstErr,
  };
}
