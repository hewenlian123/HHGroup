"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorRetry } from "@/components/ui/system-state";

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
      <ErrorRetry
        onRetry={reset}
        description="Try again, or return to Dashboard. If this keeps happening, contact an administrator."
        action={
          <Button asChild variant="quiet">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        }
      />
      <details className="mt-hh-4 text-hh-metadata text-[var(--neo-text-secondary)]">
        <summary className="cursor-pointer">Error details</summary>
        <div className="mt-hh-2 whitespace-pre-wrap break-words">{message}</div>
        {error?.digest ? <div className="mt-hh-2">Digest: {error.digest}</div> : null}
      </details>
    </div>
  );
}
