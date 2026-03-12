import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";
import { NextResponse } from "next/server";

/**
 * POST /api/ensure-schema
 * Runs schema creation (if DB URL is set) and returns status for the UI.
 */
export async function POST() {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        hasDatabaseUrl: false,
        message:
          "未配置数据库直连。请在 .env.local 中设置 SUPABASE_DATABASE_URL（Supabase → Project Settings → Database → Connection string），重启 dev server 后刷新页面。",
      },
      { status: 200 }
    );
  }

  try {
    await ensureConstructionSchema();
    return NextResponse.json({
      ok: true,
      hasDatabaseUrl: true,
      message:
        "表已创建或已存在。若仍提示找不到表，请到 Supabase 控制台 Project Settings → API 点击 Reload schema cache，然后刷新本页。",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        hasDatabaseUrl: true,
        message: `创建表时出错：${msg}`,
      },
      { status: 200 }
    );
  }
}
