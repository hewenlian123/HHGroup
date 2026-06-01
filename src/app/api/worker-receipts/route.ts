import { NextResponse } from "next/server";
import { getWorkerReceipts } from "@/lib/worker-receipts-db";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  const client = getServerSupabaseInternalNoStore();
  if (!client) {
    return NextResponse.json(
      { message: SUPABASE_MISSING_SERVER_ENV_MESSAGE },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const list = await getWorkerReceipts(client);
    return NextResponse.json({ receipts: list }, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
