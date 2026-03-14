import { NextResponse } from "next/server";
import { getSystemLogs } from "@/lib/system-log-store";

export const dynamic = "force-dynamic";

/**
 * GET: Recent system log entries (from server console capture).
 * Query: limit (default 100).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
  const logs = getSystemLogs(limit);
  return NextResponse.json({ logs });
}
