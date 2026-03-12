"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ArrowLeft, Send, CheckCircle, FolderKanban, Lock, FileText } from "lucide-react";

type Status = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

type SnapshotItem = {
  snapshotId: string;
  estimateId: string;
  version: number;
  createdAt: string;
  statusAtSnapshot: string;
  frozenPayload: {
    items: Array<{ qty: number; unitCost: number; markupPct: number }>;
    overheadPct: number;
    profitPct: number;
  };
};

export function EstimateHeader({
  estimateId,
  estimateNumber,
  status,
  snapshots,
  approveAction,
  createNewVersionAction,
  convertToProjectAction,
  sendAction,
  rejectAction,
}: {
  estimateId: string;
  estimateNumber: string;
  status: Status;
  snapshots: SnapshotItem[];
  approveAction: (formData: FormData) => Promise<void>;
  createNewVersionAction: (formData: FormData) => Promise<void>;
  convertToProjectAction: (formData: FormData) => Promise<void>;
  sendAction?: (formData: FormData) => Promise<void>;
  rejectAction?: (formData: FormData) => Promise<void>;
}) {
  const latestApproved = snapshots
    .filter((s) => s.statusAtSnapshot === "Approved")
    .sort((a, b) => b.version - a.version)[0];
  const isDraft = status === "Draft";
  const isLocked = !isDraft;
  const showEditActions = isDraft;
  const canCreateNewVersion = snapshots.some((s) => s.statusAtSnapshot === "Approved");
  const canConvert = status === "Approved";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Link href="/estimates" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Estimate #{estimateNumber}
          </h1>
          <Badge variant={status === "Draft" ? "secondary" : status === "Rejected" ? "destructive" : status === "Approved" || status === "Converted" ? "default" : "outline"} className="text-[10px] font-medium">
            Status: {status === "Converted" ? "Converted to Project" : status}
          </Badge>
          {latestApproved && (
            <span className="text-xs text-muted-foreground">
              Latest Approved: v{latestApproved.version} ({latestApproved.createdAt})
            </span>
          )}
          {isLocked && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              <Lock className="h-4 w-4" />
              Locked ({status})
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="rounded-lg border-zinc-200/60" asChild>
          <Link href={`/estimates/${estimateId}/preview`}>
            <FileText className="h-4 w-4 mr-2" />
            Preview
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg border-zinc-200/60" asChild>
          <a href={`/estimates/${estimateId}/print`} target="_blank" rel="noopener noreferrer">
            Preview PDF
          </a>
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg border-zinc-200/60" asChild>
          <a href={`/estimates/${estimateId}/print?autoprint=1`} target="_blank" rel="noopener noreferrer">
            Download PDF
          </a>
        </Button>
        {showEditActions && (
          <>
            {sendAction && (
              <form action={sendAction} className="inline-block">
                <input type="hidden" name="estimateId" value={estimateId} />
                <Button type="submit" variant="outline" size="sm" className="rounded-lg border-zinc-200/60">
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </form>
            )}
            <form action={approveAction} className="inline-block">
              <input type="hidden" name="estimateId" value={estimateId} />
              <Button type="submit" variant="outline" size="sm" className="rounded-lg border-zinc-200/60">
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </form>
          </>
        )}
        {(status === "Sent" && rejectAction) && (
          <form action={rejectAction} className="inline-block">
            <input type="hidden" name="estimateId" value={estimateId} />
            <Button type="submit" variant="outline" size="sm" className="rounded-lg border-zinc-200/60 text-destructive hover:text-destructive">
              Reject
            </Button>
          </form>
        )}
        {canCreateNewVersion && (status === "Approved" || status === "Converted") && (
          <form action={createNewVersionAction} className="inline-block">
            <input type="hidden" name="estimateId" value={estimateId} />
            <Button type="submit" variant="outline" size="sm" className="rounded-lg border-zinc-200/60">
              <FileText className="h-4 w-4 mr-2" />
              Create New Version
            </Button>
          </form>
        )}
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="rounded-lg border-zinc-200/60">
              View Versions
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Estimate Versions</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No snapshots yet. Approve to create v1.</p>
              ) : (
                snapshots.map((s) => {
                  const grandTotal = s.frozenPayload.items.reduce(
                    (sum, i) => sum + i.qty * i.unitCost * (1 + i.markupPct),
                    0
                  );
                  const withOverhead = grandTotal * (1 + s.frozenPayload.overheadPct + s.frozenPayload.profitPct);
                  return (
                    <Link
                      key={s.snapshotId}
                      href={`/estimates/${estimateId}/snapshot/${s.version}`}
                      className="block rounded-lg border border-zinc-200/60 dark:border-border p-3 hover:bg-muted/50"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">v{s.version}</span>
                        <span className="text-xs text-muted-foreground">{s.createdAt}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        ${withOverhead.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </SheetContent>
        </Sheet>
        {canConvert && (
          <form action={convertToProjectAction} className="inline-block">
            <input type="hidden" name="estimateId" value={estimateId} />
            <Button type="submit" variant="default" size="sm" className="rounded-lg">
              <FolderKanban className="h-4 w-4 mr-2" />
              Convert to Project
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
