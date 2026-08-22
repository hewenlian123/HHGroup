"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";

type WorkerProfile = {
  id: string;
  name: string;
  phone?: string | null;
  trade?: string | null;
  status: "active" | "inactive";
  halfDayRate: number;
  dailyRate: number;
  notes?: string | null;
  createdAt: string;
};

type WorkerUsage = { used: boolean; reason?: "entries" | "invoices" };

function normalizeWorker(raw: Record<string, unknown>): WorkerProfile {
  const status = String(raw.status ?? "").toLowerCase() === "inactive" ? "inactive" : "active";
  const dailyRate = Number(raw.dailyRate ?? raw.daily_rate ?? raw.halfDayRate ?? 0) || 0;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    phone: (raw.phone as string | null | undefined) ?? null,
    trade: ((raw.trade ?? raw.role) as string | null | undefined) ?? null,
    status,
    halfDayRate: Number(raw.halfDayRate ?? raw.half_day_rate ?? dailyRate) || 0,
    dailyRate,
    notes: (raw.notes as string | null | undefined) ?? null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? "").slice(0, 10),
  };
}

async function fetchWorkerProfile(id: string): Promise<{
  worker: WorkerProfile | null;
  usage: WorkerUsage;
}> {
  const res = await fetch(`/api/labor/workers/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return { worker: null, usage: { used: false } };
  const json = (await res.json().catch(() => ({}))) as {
    worker?: Record<string, unknown>;
    usage?: WorkerUsage;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message ?? "Failed to load worker.");
  }
  return {
    worker: json.worker ? normalizeWorker(json.worker) : null,
    usage: json.usage ?? { used: false },
  };
}

async function mutateWorker(
  id: string,
  method: "PATCH" | "DELETE",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/labor/workers/${encodeURIComponent(id)}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.message ?? `Failed to ${method.toLowerCase()} worker.`));
  return json;
}

export default function WorkerProfileEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [message, setMessage] = React.useState<string | null>(null);
  const [worker, setWorker] = React.useState<WorkerProfile | null | undefined>(undefined);
  const [usage, setUsage] = React.useState<WorkerUsage | null>(null);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [notes, setNotes] = React.useState("");

  const refreshAll = React.useCallback(async () => {
    if (!id) return;
    try {
      const next = await fetchWorkerProfile(id);
      setWorker(next.worker);
      setUsage(next.usage);
      if (next.worker) {
        setName(next.worker.name);
        setPhone(next.worker.phone ?? "");
        setTrade(next.worker.trade ?? "");
        setStatus(next.worker.status);
        setNotes(next.worker.notes ?? "");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load worker.");
      setWorker(null);
      setUsage({ used: false });
    }
  }, [id]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useOnAppSync(
    React.useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
    [refreshAll]
  );

  useBreadcrumbEntityLabel(name.trim() ? name : worker?.name);

  const handleSave = async () => {
    if (!id) return;
    const updated = await mutateWorker(id, "PATCH", {
      name: name.trim(),
      phone,
      trade,
      status,
      notes,
    });
    setWorker(normalizeWorker(updated));
    setMessage("Worker updated.");
  };

  const handleDisable = async () => {
    if (!id) return;
    const updated = await mutateWorker(id, "PATCH", { status: "inactive" });
    setWorker(normalizeWorker(updated));
    setStatus("inactive");
    setMessage("Worker set to inactive.");
  };

  const handleDelete = async () => {
    if (!id) return;
    const u = usage ?? { used: false };
    if (u.used) {
      setMessage("Delete blocked: this worker has labor entries or labor invoices. Use Disable.");
      return;
    }
    await mutateWorker(id, "DELETE");
    router.push("/workers");
  };

  const usageRes = usage ?? { used: false };

  if (!id) {
    return (
      <div className="mx-auto flex max-w-[680px] flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-hh-compact">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === undefined) {
    return (
      <div className="mx-auto flex max-w-[680px] flex-col gap-6 p-6">
        <p className="text-muted-foreground">Loading…</p>
        <Link href={`/workers/${id}`}>
          <Button variant="outline" className="w-fit rounded-hh-compact">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === null) {
    return (
      <div className="mx-auto flex max-w-[680px] flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-hh-compact">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-6 p-6">
      <PageHeader
        title="Edit worker profile"
        description={`Editing ${worker.name}`}
        actions={
          <Link href={`/workers/${id}`}>
            <Button variant="outline" size="sm" className="rounded-hh-compact">
              Back
            </Button>
          </Link>
        }
      />
      {message ? (
        <p className="border-b border-[var(--hh-border)] pb-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <section className="border-b border-[var(--hh-border)] pb-6">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
              Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-hh-compact"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
              Phone
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-hh-compact"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
              Trade
            </label>
            <Input
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="rounded-hh-compact"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
              Status
            </label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-hh-table-header font-medium uppercase tracking-normal text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[88px] rounded-hh-compact border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Created: {worker.createdAt}{" "}
            {usageRes.used ? "• Used in labor records" : "• Not used yet"}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Link href={`/workers/${id}`}>
            <Button variant="outline" size="sm" className="rounded-hh-compact">
              Cancel
            </Button>
          </Link>
          {usageRes.used ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-hh-compact"
              disabled={status === "inactive"}
              onClick={handleDisable}
            >
              Disable
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-hh-compact"
              onClick={handleDelete}
            >
              Delete
            </Button>
          )}
          <Button
            size="sm"
            className="rounded-hh-compact"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save Changes
          </Button>
        </div>
      </section>
    </div>
  );
}
