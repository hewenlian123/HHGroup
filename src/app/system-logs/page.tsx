"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  DataTable,
  PageHeader,
  PageLayout,
  StatusBadge,
  type DataTableColumn,
} from "@/components/base";
import { Button } from "@/components/ui/button";

type LogEntry = {
  time: string;
  module: string;
  type: string;
  message: string;
};

function logVariant(type: string) {
  if (type === "Error") return "danger" as const;
  if (type === "Warning") return "warning" as const;
  return "muted" as const;
}

const logColumns: DataTableColumn<LogEntry>[] = [
  { key: "time", header: "Time", className: "w-[90px] text-[var(--neo-text-secondary)]" },
  { key: "module", header: "Module", className: "w-[140px]" },
  {
    key: "type",
    header: "Type",
    className: "w-[100px]",
    cell: (entry) => <StatusBadge label={entry.type} variant={logVariant(entry.type)} />,
  },
  {
    key: "message",
    header: "Message",
    className: "break-words text-[var(--neo-text-secondary)]",
  },
];

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

  useOnAppSync(
    React.useCallback(() => {
      load();
    }, [load]),
    [load]
  );

  return (
    <PageLayout
      header={
        <PageHeader
          title="System Logs"
          description="Recent system events and errors from server console."
          actions={
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          }
        />
      }
    >
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <DataTable<LogEntry>
        columns={logColumns}
        data={logs}
        getRowId={(entry, index) => `${entry.time}-${index}`}
        loading={loading}
        emptyState="No log entries yet. Server console output will appear here after instrumentation captures it."
      />
    </PageLayout>
  );
}
