"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  DataTable,
  PageHeader,
  PageLayout,
  SectionHeader,
  type DataTableColumn,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [confirmingCreate, setConfirmingCreate] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const backupColumns = React.useMemo<DataTableColumn<BackupListItem>[]>(
    () => [
      {
        key: "filename",
        header: "Filename",
        cell: (backup) => (
          <span className="text-xs font-medium text-[var(--neo-text-primary)]">
            {backup.filename}
          </span>
        ),
      },
      { key: "date", header: "Date", className: "text-[var(--neo-text-secondary)]" },
      {
        key: "sizeBytes",
        header: "Size",
        numeric: true,
        cell: (backup) => formatBytes(backup.sizeBytes),
      },
      {
        key: "createdAt",
        header: "Created",
        className: "text-[var(--neo-text-secondary)]",
        cell: (backup) => formatDate(backup.createdAt),
      },
    ],
    []
  );

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

  useOnAppSync(
    React.useCallback(() => {
      void loadList();
    }, [loadList]),
    [loadList]
  );

  // ── create backup ───────────────────────────────────────────────────────────
  const handleCreate = React.useCallback(async () => {
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/system/backup", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      const data: CreateResult = await res.json();
      setCreateResult(data);
      if (data.ok) {
        setConfirmingCreate(false);
        setConfirmation("");
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
  }, [confirmation, loadList]);

  return (
    <PageLayout
      header={
        <PageHeader
          title="System Backups"
          description="Create and manage JSON exports of all critical database tables."
          actions={
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
              onClick={() => setConfirmingCreate(true)}
              disabled={creating}
            >
              {creating ? "Creating Backup…" : "Create Backup Now"}
            </Button>
          }
        />
      }
    >
      {confirmingCreate ? (
        <div className="rounded-xl border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-4 py-3 text-sm text-[var(--neo-text-primary)]">
          <p className="font-medium">Confirm backup export</p>
          <p className="mt-1 text-xs text-[var(--neo-text-secondary)]">
            This creates a database JSON export for the owner account. Type{" "}
            <span className="font-semibold text-[var(--neo-gold)]">BACKUP</span> to continue.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="BACKUP"
              className="min-h-[44px] w-full sm:max-w-[220px]"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-h-[44px] sm:min-h-0"
                onClick={handleCreate}
                disabled={creating || confirmation.trim() !== "BACKUP"}
              >
                Create Backup
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[44px] sm:min-h-0"
                onClick={() => {
                  setConfirmingCreate(false);
                  setConfirmation("");
                }}
                disabled={creating}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create result banner */}
      {createResult && (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-xl border px-4 py-3 text-sm",
            createResult.ok
              ? "border-emerald-500/20 bg-[var(--neo-emerald-soft)] text-[var(--neo-emerald)] dark:bg-emerald-500/15 dark:text-emerald-300"
              : "border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]"
          )}
        >
          <p className="font-medium">{createResult.message}</p>
          {createResult.ok && createResult.filename && (
            <p className="text-xs">
              {createResult.filename} - {formatBytes(createResult.sizeBytes ?? 0)}
            </p>
          )}
          {Array.isArray(createResult.tableErrors) && createResult.tableErrors.length > 0 && (
            <p className="text-xs">Table errors: {createResult.tableErrors.join(", ")}</p>
          )}
          {/* Offer download when file write failed but data was fetched */}
          {!createResult.ok && createResult.data != null && createResult.filename ? (
            <button
              type="button"
              className="mt-1 w-fit text-xs underline underline-offset-2"
              onClick={() =>
                downloadJson(createResult.data, createResult.filename ?? "backup.json")
              }
            >
              Download backup data manually
            </button>
          ) : null}
        </div>
      )}

      {/* Backup list */}
      <div className="flex flex-col gap-1">
        <SectionHeader label="Saved Backups" />
        <p className="-mt-0.5 text-xs leading-relaxed text-[var(--neo-canvas-text-secondary)]">
          Files are saved to{" "}
          <code className="rounded bg-white/[0.92] px-1 py-0.5 text-[var(--neo-text-primary)]">
            backups/database/
          </code>{" "}
          in the project root. Only available in local or self-hosted environments.
        </p>
      </div>

      {listError ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{listError}</p>
      ) : (
        <DataTable<BackupListItem>
          columns={backupColumns}
          data={backups}
          getRowId={(backup) => backup.filename}
          loading={loadingList}
          emptyState='No backups yet. Click "Create Backup Now" to create the first one.'
        />
      )}

      {/* Info note */}
      <div className="border-t border-[var(--neo-border)] pt-4">
        <p className="text-xs leading-relaxed text-[var(--neo-canvas-text-secondary)]">
          Backups export all rows from:{" "}
          <span className="font-medium text-[var(--neo-canvas-text-primary)]">
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
    </PageLayout>
  );
}
