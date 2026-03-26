"use client";

import * as React from "react";
import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { AddDailyEntryModal } from "@/app/labor/add-daily-entry-modal";
import { dispatchClientDataSync } from "@/lib/sync-router-client";

export default function WorkerDailyEntryPage() {
  const [nonce, setNonce] = React.useState(0);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Daily Entry"
          description="Worker mode: add AM/PM attendance and OT using the same labor form."
          actions={
            <Link href="/labor/daily?mode=exit">
              <Button size="sm" variant="outline">
                Exit Worker Mode
              </Button>
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Quick Entry" />
      <Divider />
      <AddDailyEntryModal
        key={nonce}
        open
        onOpenChange={() => {
          // Keep worker mode focused on a single, always-open entry form.
        }}
        onSuccess={() => {
          setNonce((n) => n + 1);
          dispatchClientDataSync({ reason: "worker-daily-entry-created" });
        }}
      />
    </PageLayout>
  );
}
