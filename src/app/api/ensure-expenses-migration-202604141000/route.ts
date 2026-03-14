/**
 * GET: Check if expenses has source, source_id.
 * POST: If missing, run migration 202604141000 (add source, source_id, paid status).
 * Requires SUPABASE_DATABASE_URL or DATABASE_URL in .env.local.
 */
import { NextResponse } from "next/server";
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

function getUrl() {
  return process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
}

export async function GET() {
  const url = getUrl();
  if (!url) {
    return NextResponse.json(
      { ok: false, hasColumns: false, message: "未配置 SUPABASE_DATABASE_URL 或 DATABASE_URL" },
      { status: 200 }
    );
  }
  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses'
      AND column_name IN ('source', 'source_id')
      ORDER BY column_name
    `;
    await sql.end();
    const hasColumns = cols.length === 2;
    return NextResponse.json({
      ok: true,
      hasColumns,
      columns: cols.map((r) => r.column_name),
      message: hasColumns ? "expenses 表已包含 source、source_id 字段" : "expenses 表缺少 source 或 source_id 字段",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, hasColumns: false, message: `查询失败: ${msg}` }, { status: 200 });
  }
}

export async function POST() {
  const url = getUrl();
  if (!url) {
    return NextResponse.json(
      { ok: false, message: "未配置 SUPABASE_DATABASE_URL 或 DATABASE_URL" },
      { status: 200 }
    );
  }
  try {
    const sql = postgres(url, { max: 1, connect_timeout: 10 });
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expenses'
      AND column_name IN ('source', 'source_id')
      ORDER BY column_name
    `;
    if (cols.length === 2) {
      await sql.end();
      return NextResponse.json({
        ok: true,
        alreadyApplied: true,
        message: "迁移已存在，无需执行。",
      });
    }
    const migrationPath = join(process.cwd(), "supabase/migrations/202604141000_expenses_source_source_id_paid.sql");
    const migrationSql = readFileSync(migrationPath, "utf8");
    await sql.unsafe(migrationSql);
    await sql.end();
    return NextResponse.json({
      ok: true,
      alreadyApplied: false,
      message: "已执行迁移 202604141000，expenses 表已添加 source、source_id 及 paid 状态。请到 Supabase 控制台 Reload schema cache。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: `执行迁移失败: ${msg}` }, { status: 200 });
  }
}
