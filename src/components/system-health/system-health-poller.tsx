"use client";

import * as React from "react";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useToast } from "@/components/toast/toast-provider";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 60_000;

export function SystemHealthPoller() {
  const { setSystemHealth } = useSystemHealth();
  const { toast } = useToast();
  const router = useRouter();
  const hasShownToastRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/system-health", { method: "GET" });
        const data = await res.json().catch(() => ({}));
        const status = data?.status === "warning" ? "warning" : "ok";
        if (!cancelled) {
          setSystemHealth({ status });
          if (status === "warning") {
            if (!hasShownToastRef.current) {
              hasShownToastRef.current = true;
              toast({
                title: "⚠ System issue detected",
                description: "Click to open System Health",
                variant: "error",
                durationMs: 8000,
                onClick: () => router.push("/system-health"),
              });
            }
          } else {
            hasShownToastRef.current = false;
          }
        }
      } catch {
        if (!cancelled) {
          setSystemHealth({ status: "warning" });
          if (!hasShownToastRef.current) {
            hasShownToastRef.current = true;
            toast({
              title: "⚠ System issue detected",
              description: "Click to open System Health",
              variant: "error",
              durationMs: 8000,
              onClick: () => router.push("/system-health"),
            });
          }
        }
      }
    };

    void run();
    const interval = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setSystemHealth, toast, router]);

  return null;
}
