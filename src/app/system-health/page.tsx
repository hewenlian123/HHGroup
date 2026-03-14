"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

type ModuleRow = { name: string; status: string; message?: string };

export default function SystemHealthPage() {
  const [status, setStatus] = React.useState<"ok" | "warning" | null>(null);
  const [modules, setModules] = React.useState<ModuleRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/system-health")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setStatus(data?.status ?? "ok");
          setModules(Array.isArray(data?.modules) ? data.modules : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("warning");
          setModules([{ name: "api", status: "fail", message: "Request failed" }]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Health"
        description="Current status of system modules. Auto-check runs every 60 seconds."
      />
      <div className="border-b border-border/60 pb-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Status:{" "}
              <span className={status === "warning" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                {status === "warning" ? "⚠ Warning" : "OK"}
              </span>
            </p>
            {modules.length > 0 && (
              <div className="table-responsive mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Module</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.name} className="border-b border-border/30">
                      <td className="py-2 pr-4">{m.name}</td>
                      <td className="py-2 pr-4">{m.status === "ok" ? "ok" : "fail"}</td>
                      <td className="py-2 text-muted-foreground">{m.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}
      </div>
      <Link href="/dashboard">
        <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
