import { createWorker } from "@/lib/data";
import { NextResponse } from "next/server";

const SEED_WORKERS: { name: string; daily_rate: number }[] = [
  { name: "何琪", daily_rate: 200 },
  { name: "小五", daily_rate: 0 },
  { name: "小何", daily_rate: 200 },
  { name: "小余", daily_rate: 200 },
  { name: "忠黄", daily_rate: 200 },
  { name: "戴瓶", daily_rate: 400 },
  { name: "林秀强", daily_rate: 300 },
  { name: "海军", daily_rate: 200 },
  { name: "群飞", daily_rate: 280 },
  { name: "老林", daily_rate: 200 },
  { name: "老薛", daily_rate: 190 },
  { name: "行伍", daily_rate: 280 },
];

/**
 * POST /api/seed-workers
 * Inserts the predefined workers with daily_rate. Idempotent only in the sense
 * that it creates; duplicate names will create duplicate rows.
 */
export async function POST() {
  try {
    const created: { name: string; id: string }[] = [];
    for (const w of SEED_WORKERS) {
      const worker = await createWorker({
        name: w.name,
        dailyRate: w.daily_rate,
        status: "active",
      });
      created.push({ name: worker.name, id: worker.id });
    }
    return NextResponse.json({
      ok: true,
      message: `Inserted ${created.length} workers.`,
      workers: created,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `Seed failed: ${msg}` }, { status: 500 });
  }
}
