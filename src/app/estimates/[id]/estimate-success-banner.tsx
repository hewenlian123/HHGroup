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
      className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      {message}
    </div>
  );
}
