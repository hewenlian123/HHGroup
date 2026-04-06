"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorker } from "@/lib/data";

export default function NewWorkerPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [halfDayRate, setHalfDayRate] = React.useState(0);
  const [notes, setNotes] = React.useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const next = await createWorker({
      name: name.trim(),
      phone,
      trade,
      halfDayRate: Number.isFinite(halfDayRate) ? Math.max(0, halfDayRate) : 0,
      notes,
      status: "active",
    });
    router.push(`/workers/${next.id}`);
  };

  return (
    <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
      <PageHeader
        title="New Worker"
        description="Create a worker profile with default half-day rate."
      />
      <section className="border-b border-gray-100 pb-6 dark:border-border">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Name *
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-sm" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Phone
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Trade
            </label>
            <Input
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Half-day Rate
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={halfDayRate}
              onChange={(e) => setHalfDayRate(Number(e.target.value) || 0)}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[88px] rounded-sm border border-gray-100 bg-background px-3 py-2 text-sm dark:border-border"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={() => router.push("/workers")}
          >
            Cancel
          </Button>
          <Button size="sm" className="rounded-sm" onClick={handleCreate} disabled={!name.trim()}>
            Create Worker
          </Button>
        </div>
      </section>
    </div>
  );
}
