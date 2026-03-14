"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";

type LogEntry = {
  time: string;
  module: string;
  type: string;
  message: string;
};

export default function SystemLogsPage() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/system-logs?limit=200")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => {
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Logs"
        description="Recent system events and errors from server console."
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="min-h-[44px] min-w-[44px] rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 flex items-center justify-center touch-target"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="table-responsive border-b border-border/60">
        <table className="w-full text-sm min-w-[360px] sm:min-w-0">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium w-[90px]">Time</th>
              <th className="py-2 pr-4 font-medium w-[140px]">Module</th>
              <th className="py-2 pr-4 font-medium w-[80px]">Type</th>
              <th className="py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No log entries yet. Server console output will appear here after instrumentation captures it.
                </td>
              </tr>
            ) : (
              logs.map((entry, i) => (
                <tr key={`${entry.time}-${i}`} className="border-b border-border/30">
                  <td className="py-2 pr-4 tabular-nums text-muted-foreground">{entry.time}</td>
                  <td className="py-2 pr-4">{entry.module}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        entry.type === "Error"
                          ? "text-red-600 dark:text-red-400"
                          : entry.type === "Warning"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                      }
                    >
                      {entry.type}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground break-words">{entry.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
