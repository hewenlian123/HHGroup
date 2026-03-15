"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const REFRESH_INTERVAL_MS = 30_000;

type GuardianCheck = {
  name: string;
  ok: boolean;
  error?: string;
};

type GuardianResult = {
  ok: boolean;
  checks: GuardianCheck[];
  checkedAt?: string;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

function StatusLabel({ ok }: { ok: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 ${
        ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      <StatusDot ok={ok} />
      {ok ? "OK" : "Failed"}
    </span>
  );
}

export default function SystemHealthPage() {
  const [result, setResult] = React.useState<GuardianResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchGuardian = React.useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/system/guardian", { cache: "no-store" });
      const data: GuardianResult = await res.json();
      setResult(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach guardian");
      setResult({ ok: false, checks: [] });
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    void fetchGuardian();
  }, [fetchGuardian]);

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const id = setInterval(() => void fetchGuardian(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchGuardian]);

  const anyFailed = result !== null && !result.ok;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Health"
        description="System Guardian verifies each critical module every 30 seconds."
        actions={
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            onClick={() => fetchGuardian(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Checking…" : "Refresh Now"}
          </Button>
        }
      />

      {/* Warning banner */}
      {anyFailed && !loading && (
        <div className="flex items-start gap-3 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
          <span className="text-base leading-none">⚠</span>
          <div>
            <p className="font-medium">System issue detected.</p>
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
              One or more modules are not responding correctly. Check the table below for details.
              Failures are recorded in{" "}
              <Link href="/system-logs" className="underline underline-offset-2">
                System Logs
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* Last refreshed + overall status */}
      {!loading && result && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2 font-medium">
            Overall:{" "}
            <StatusLabel ok={result.ok} />
          </span>
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Last checked{" "}
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              {" · "}auto-refreshes every 30 s
            </span>
          )}
        </div>
      )}

      {/* Checks table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Checking modules…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="table-responsive">
          <table className="w-full min-w-[360px] sm:min-w-0 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-6 font-medium">Module</th>
                <th className="py-2 pr-6 font-medium">Status</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {result?.checks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    No data.
                  </td>
                </tr>
              ) : (
                result?.checks.map((ch) => (
                  <tr key={ch.name} className="border-b border-border/30">
                    <td className="py-2.5 pr-6 font-medium">{ch.name}</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={ch.ok} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {ch.ok ? "—" : (ch.error ?? "Check failed")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Link href="/dashboard">
        <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
