"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";

export function EstimateSuccessBanner({ created, saved }: { created?: string; saved?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!created && !saved) return;
    const t = setTimeout(() => {
      const u = new URL(pathname, window.location.origin);
      if (u.pathname === "/estimates") {
        u.searchParams.delete("created");
        u.searchParams.delete("saved");
        router.replace(u.pathname + (u.search || ""));
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [created, saved, pathname, router]);

  if (!created && !saved) return null;

  const message = created ? "Estimate created." : "Changes saved.";
  return (
    <div
      role="status"
      className="mb-4 rounded-hh-standard border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] px-4 py-2 text-hh-label text-[var(--hh-success)]"
    >
      {message}
    </div>
  );
}
