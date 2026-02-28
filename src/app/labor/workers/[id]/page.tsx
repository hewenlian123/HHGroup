"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkerById, updateWorker, getWorkerUsage, disableWorker, deleteWorker } from "@/lib/data";

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [message, setMessage] = React.useState<string | null>(null);
  const worker = React.useMemo(() => (id ? getWorkerById(id) : null), [id]);

  const [name, setName] = React.useState(worker?.name ?? "");
  const [phone, setPhone] = React.useState(worker?.phone ?? "");
  const [trade, setTrade] = React.useState(worker?.trade ?? "");
  const [status, setStatus] = React.useState<"active" | "inactive">(worker?.status ?? "active");
  const [halfDayRate, setHalfDayRate] = React.useState(worker?.halfDayRate ?? 0);
  const [notes, setNotes] = React.useState(worker?.notes ?? "");

  React.useEffect(() => {
    if (!worker) return;
    setName(worker.name);
    setPhone(worker.phone ?? "");
    setTrade(worker.trade ?? "");
    setStatus(worker.status);
    setHalfDayRate(worker.halfDayRate);
    setNotes(worker.notes ?? "");
  }, [worker]);

  if (!id || !worker) {
    return (
      <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/labor/workers">
          <Button variant="outline" className="rounded-lg w-fit">Back to Workers</Button>
        </Link>
      </div>
    );
  }

  const usage = getWorkerUsage(id);

  const handleSave = () => {
    const updated = updateWorker(id, {
      name: name.trim(),
      phone,
      trade,
      status,
      halfDayRate: Number.isFinite(halfDayRate) ? Math.max(0, halfDayRate) : 0,
      notes,
    });
    if (!updated) {
      setMessage("Unable to save worker.");
      return;
    }
    setMessage("Worker updated.");
  };

  const handleDisable = () => {
    disableWorker(id);
    setStatus("inactive");
    setMessage("Worker set to inactive.");
  };

  const handleDelete = () => {
    const used = getWorkerUsage(id).used;
    if (used) {
      setMessage("Delete blocked: this worker has labor entries or labor invoices. Use Disable.");
      return;
    }
    deleteWorker(id);
    router.push("/labor/workers");
  };

  return (
    <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
      <PageHeader title="Worker Profile" description="View and edit worker details and half-day rate." />
      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Trade</label>
            <Input value={trade} onChange={(e) => setTrade(e.target.value)} className="rounded-lg" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Half-day Rate</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={halfDayRate}
              onChange={(e) => setHalfDayRate(Number(e.target.value) || 0)}
              className="rounded-lg"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[88px] rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Created: {worker.createdAt} {usage.used ? "• Used in labor records" : "• Not used yet"}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Link href="/labor/workers">
            <Button variant="outline" className="rounded-lg">Back</Button>
          </Link>
          <Link href={`/labor/workers/${id}/statement`}>
            <Button variant="outline" className="rounded-lg">Statement</Button>
          </Link>
          {usage.used ? (
            <Button variant="outline" className="rounded-lg" disabled={status === "inactive"} onClick={handleDisable}>
              Disable
            </Button>
          ) : (
            <Button variant="outline" className="rounded-lg" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button className="rounded-lg" onClick={handleSave} disabled={!name.trim()}>
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
