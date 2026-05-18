import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getSystemLogs } from "@/lib/system-log-store";
import { sanitizeSystemLogEntry } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";

/**
 * GET: Recent system log entries (from server console capture).
 * Query: limit (default 100).
 */
export async function GET(req: Request) {
  const guard = await requireAuthenticatedUser(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const logs = getSystemLogs(limit).map(sanitizeSystemLogEntry);
  return NextResponse.json({ logs });
}
