"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error?.message ? String(error.message) : "Something went wrong.";

  return (
    <div className="page-container page-stack py-10">
      <div className="border-b border-border/60 pb-4">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Try again, or return to Dashboard. If this keeps happening, contact an admin.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" className="h-8" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Error</div>
        <div className="mt-1 whitespace-pre-wrap break-words">{message}</div>
        {error?.digest ? <div className="mt-2">Digest: {error.digest}</div> : null}
      </div>
    </div>
  );
}

