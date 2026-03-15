"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

type BackupListItem = {
  filename: string;
  date: string;
  sizeBytes: number;
  createdAt: string;
};

type CreateResult = {
  ok: boolean;
  message: string;
  filename?: string;
  date?: string;
  sizeBytes?: number;
  tableErrors?: string[];
  data?: unknown;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Trigger a browser download of the backup data returned in the API response. */
function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SystemBackupsPage() {
  const [backups, setBackups] = React.useState<BackupListItem[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);

  const [creating, setCreating] = React.useState(false);
  const [createResult, setCreateResult] = React.useState<CreateResult | null>(null);

  // ── load backup list ────────────────────────────────────────────────────────
  const loadList = React.useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/system/backup", { cache: "no-store" });
      const data: { ok: boolean; backups?: BackupListItem[]; error?: string } = await res.json();
      setBackups(Array.isArray(data.backups) ? data.backups : []);
      if (!data.ok) setListError(data.error ?? "Failed to list backups");
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  // ── create backup ───────────────────────────────────────────────────────────
  const handleCreate = React.useCallback(async () => {
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/system/backup", {
        method: "POST",
        cache: "no-store",
      });
      const data: CreateResult = await res.json();
      setCreateResult(data);
      if (data.ok) {
        // Refresh the list after a successful backup
        await loadList();
      }
    } catch (e) {
      setCreateResult({
        ok: false,
        message: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setCreating(false);
    }
  }, [loadList]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Backups"
        description="Create and manage JSON exports of all critical database tables."
        actions={
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating Backup…" : "Create Backup Now"}
          </Button>
        }
      />

      {/* Create result banner */}
      {createResult && (
        <div
          className={`flex flex-col gap-1 rounded-sm border px-4 py-3 text-sm ${
            createResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300"
          }`}
        >
          <p className="font-medium">
            {createResult.ok ? "✓ " : "⚠ "}
            {createResult.message}
          </p>
          {createResult.ok && createResult.filename && (
            <p className="text-xs">
              {createResult.filename} — {formatBytes(createResult.sizeBytes ?? 0)}
            </p>
          )}
          {Array.isArray(createResult.tableErrors) && createResult.tableErrors.length > 0 && (
            <p className="text-xs">
              Table errors: {createResult.tableErrors.join(", ")}
            </p>
          )}
          {/* Offer download when file write failed but data was fetched */}
          {!createResult.ok && createResult.data && createResult.filename && (
            <button
              type="button"
              className="mt-1 w-fit text-xs underline underline-offset-2"
              onClick={() =>
                downloadJson(createResult.data, createResult.filename ?? "backup.json")
              }
            >
              Download backup data manually
            </button>
          )}
        </div>
      )}

      {/* Backup list */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Saved Backups
        </p>
        <p className="text-xs text-muted-foreground -mt-0.5">
          Files are saved to{" "}
          <code className="rounded bg-muted px-1 py-0.5">backups/database/</code> in the project
          root. Only available in local or self-hosted environments.
        </p>
      </div>

      {loadingList ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : listError ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{listError}</p>
      ) : (
        <div className="table-responsive">
          <table className="w-full min-w-[420px] sm:min-w-0 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-6 font-medium">Filename</th>
                <th className="py-2 pr-6 font-medium">Date</th>
                <th className="py-2 pr-6 font-medium">Size</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No backups yet. Click &ldquo;Create Backup Now&rdquo; to create the first one.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename} className="border-b border-border/30">
                    <td className="py-2.5 pr-6 font-medium font-mono text-xs">
                      {b.filename}
                    </td>
                    <td className="py-2.5 pr-6 tabular-nums">{b.date}</td>
                    <td className="py-2.5 pr-6 tabular-nums text-muted-foreground">
                      {formatBytes(b.sizeBytes)}
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">
                      {formatDate(b.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Info note */}
      <div className="border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          Backups export all rows from:{" "}
          <span className="font-mono">
            projects, workers, worker_receipts, worker_reimbursements, labor_entries, expenses,
            expense_lines, invoices, payments_received
          </span>
          . Each backup is a single JSON file. Failures are logged to{" "}
          <a href="/system-logs" className="underline underline-offset-2">
            System Logs
          </a>
          .
        </p>
      </div>
    </div>
  );
}
