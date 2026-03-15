/**
 * POST /api/test/run-all-tests
 *
 * Runs all test groups sequentially and returns unified results:
 * 1. System Tests (full-system-test)
 * 2. UI Tests (run-ui-tests)
 * 3. API Health Check (guardian)
 * 4. Database Schema Check (schema-check)
 *
 * Returns { ok, groups: [{ name, ok, executionTimeMs, error?, details? }] }
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for UI tests + system tests

export type RunAllTestsGroup = {
  name: string;
  ok: boolean;
  executionTimeMs: number;
  error?: string;
  details?: unknown;
};

export async function POST(req: Request): Promise<NextResponse> {
  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const groups: RunAllTestsGroup[] = [];

  // ── 1. System Tests (full-system-test) ─────────────────────────────────────
  {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/test/run-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suite: "full" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        tests?: Array<{ test: string; status: string; message?: string }>;
        message?: string;
      };
      const elapsed = Date.now() - start;
      const ok = res.ok && data.ok === true;
      const failed = (data.tests ?? []).filter((t) => t.status === "failed");
      const error = !ok
        ? (data.message ?? (failed.length > 0 ? failed.map((t) => `${t.test}: ${t.message || "failed"}`).join("; ") : `HTTP ${res.status}`))
        : undefined;
      groups.push({
        name: "System Tests",
        ok,
        executionTimeMs: elapsed,
        ...(error ? { error } : {}),
        details: data.tests ?? undefined,
      });
    } catch (e) {
      groups.push({
        name: "System Tests",
        ok: false,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  // ── 2. UI Tests ───────────────────────────────────────────────────────────
  {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/test/run-ui-tests`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        tests?: Array<{ name: string; ok: boolean; error?: string }>;
        error?: string;
      };
      const elapsed = Date.now() - start;
      const ok = res.ok && data.ok === true;
      const failed = (data.tests ?? []).filter((t) => !t.ok);
      const error = !ok
        ? (data.error ?? (failed.length > 0 ? failed.map((t) => `${t.name}: ${t.error || "failed"}`).join("; ") : `HTTP ${res.status}`))
        : undefined;
      groups.push({
        name: "UI Tests",
        ok,
        executionTimeMs: elapsed,
        ...(error ? { error } : {}),
        details: data.tests ?? undefined,
      });
    } catch (e) {
      groups.push({
        name: "UI Tests",
        ok: false,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  // ── 3. API Health Check (Guardian) ─────────────────────────────────────────
  {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/system/guardian`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        checks?: Array<{ name: string; ok: boolean; error?: string }>;
      };
      const elapsed = Date.now() - start;
      const ok = res.ok && data.ok === true;
      const failed = (data.checks ?? []).filter((c) => !c.ok);
      const error = !ok
        ? (failed.length > 0 ? failed.map((c) => `${c.name}: ${c.error ?? "failed"}`).join("; ") : `HTTP ${res.status}`)
        : undefined;
      groups.push({
        name: "API Health Check",
        ok,
        executionTimeMs: elapsed,
        ...(error ? { error } : {}),
        details: data.checks ?? undefined,
      });
    } catch (e) {
      groups.push({
        name: "API Health Check",
        ok: false,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  // ── 4. Database Schema Check ───────────────────────────────────────────────
  {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/schema-check`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        missing?: string[];
        message?: string;
      };
      const elapsed = Date.now() - start;
      const ok = res.ok && data.status === "ok";
      const error = !ok
        ? (data.missing?.length ? `Missing tables or columns: ${data.missing.join(", ")}` : data.message ?? `HTTP ${res.status}`)
        : undefined;
      groups.push({
        name: "Database Schema Check",
        ok,
        executionTimeMs: elapsed,
        ...(error ? { error } : {}),
        details: data.missing?.length ? { missing: data.missing } : undefined,
      });
    } catch (e) {
      groups.push({
        name: "Database Schema Check",
        ok: false,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  }

  const allOk = groups.every((g) => g.ok);
  return NextResponse.json({ ok: allOk, groups });
}
