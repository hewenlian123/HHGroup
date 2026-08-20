"use client";

import * as React from "react";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useToast } from "@/components/toast/toast-provider";
import { usePathname, useRouter } from "next/navigation";
import { shouldShowSystemHealthToast } from "./system-health-toast-policy";

const POLL_INTERVAL_MS = 60_000;
const STATUS_CACHE_TTL_MS = 30_000;

let cachedStatus: { status: "ok" | "warning"; at: number } | null = null;
let inFlightStatusRequest: Promise<"ok" | "warning"> | null = null;

async function fetchSystemHealthStatus(): Promise<"ok" | "warning"> {
  const now = Date.now();
  if (cachedStatus && now - cachedStatus.at < STATUS_CACHE_TTL_MS) {
    return cachedStatus.status;
  }

  if (inFlightStatusRequest) return inFlightStatusRequest;

  inFlightStatusRequest = (async () => {
    const res = await fetch("/api/system-health", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    const status = data?.status === "warning" ? "warning" : "ok";
    cachedStatus = { status, at: Date.now() };
    return status;
  })();

  try {
    return await inFlightStatusRequest;
  } finally {
    inFlightStatusRequest = null;
  }
}

export function SystemHealthPoller() {
  const { setSystemHealth } = useSystemHealth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const hasShownToastRef = React.useRef(false);

  React.useEffect(() => {
    if (pathname === "/system-health" || pathname === "/settings/system-health") return;

    let cancelled = false;

    const run = async () => {
      try {
        const status = await fetchSystemHealthStatus();
        if (!cancelled) {
          setSystemHealth({ status });
          if (status === "warning" && shouldShowSystemHealthToast(pathname)) {
            if (!hasShownToastRef.current) {
              hasShownToastRef.current = true;
              toast({
                title: "System issue detected",
                description: "Click to open System Health",
                variant: "system",
                durationMs: 5000,
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
          if (!hasShownToastRef.current && shouldShowSystemHealthToast(pathname)) {
            hasShownToastRef.current = true;
            toast({
              title: "System issue detected",
              description: "Click to open System Health",
              variant: "system",
              durationMs: 5000,
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
  }, [pathname, setSystemHealth, toast, router]);

  return null;
}
