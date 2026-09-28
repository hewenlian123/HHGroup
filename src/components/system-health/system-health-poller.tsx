"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useToast } from "@/components/toast/toast-provider";
import { usePathname, useRouter } from "next/navigation";
import { scheduleInitialSystemHealthPoll } from "./system-health-poll-scheduler";
import { shouldShowSystemHealthToast } from "./system-health-toast-policy";

const POLL_INTERVAL_MS = 60_000;
const STATUS_CACHE_TTL_MS = 30_000;

let cachedStatus: { status: "ok" | "warning"; at: number } | null = null;
let inFlightStatusRequest: Promise<"ok" | "warning"> | null = null;

export async function fetchSystemHealthStatus(): Promise<"ok" | "warning"> {
  const now = Date.now();
  if (cachedStatus && now - cachedStatus.at < STATUS_CACHE_TTL_MS) {
    return cachedStatus.status;
  }

  if (inFlightStatusRequest) return inFlightStatusRequest;

  inFlightStatusRequest = (async () => {
    const res = await fetch("/api/system-health", { method: "GET" });
    if (!res.ok) throw new Error("System health is unavailable.");
    const data = await res.json();
    if (data?.status !== "ok" && data?.status !== "warning") {
      throw new Error("System health returned an invalid status.");
    }
    const status: "ok" | "warning" = data.status;
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
  const { initialized, permissions, role } = useAuth();
  const canReadSystemHealth =
    initialized && permissions["settings.view"] && (role === "owner" || role === "admin");
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const hasShownToastRef = React.useRef(false);

  React.useEffect(() => {
    if (!canReadSystemHealth) return;
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

    const cancelInitialPoll = scheduleInitialSystemHealthPoll(run);
    const interval = setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      cancelInitialPoll();
      clearInterval(interval);
    };
  }, [pathname, setSystemHealth, toast, router, canReadSystemHealth]);

  return null;
}
