import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";
import { runSchemaAutoRepair } from "@/lib/ensure-schema-auto-repair";
import { NextResponse } from "next/server";

/**
 * POST /api/ensure-schema
 * 1) ensureConstructionSchema is a no-op (schema = supabase/migrations only).
 * 2) Runs schema auto-repair (worker_payments, expenses columns, expense_lines, payments_received, labor_entries).
 * Returns combined status for the UI.
 */
export async function POST() {
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        hasDatabaseUrl: false,
        message:
          "Direct database URL is required. Set SUPABASE_DATABASE_URL or DATABASE_URL in .env.local (Supabase → Project Settings → Database → Connection string), then restart the dev server.",
      },
      { status: 200 }
    );
  }

  let constructionOk = true;
  let constructionMessage = "";

  try {
    await ensureConstructionSchema();
    constructionMessage =
      "Core schema is managed by Supabase migrations (construction DDL no-op).";
  } catch (err) {
    constructionOk = false;
    constructionMessage = err instanceof Error ? err.message : String(err);
  }

  const autoRepair = await runSchemaAutoRepair();

  const ok = constructionOk && autoRepair.ok;
  const parts = [autoRepair.message];
  if (constructionMessage) parts.push(constructionMessage);
  const message = parts.join(" ");

  return NextResponse.json(
    {
      ok,
      hasDatabaseUrl: true,
      message:
        message +
        (ok ? " If you still see 'column not in schema cache', reload the schema cache in Supabase Dashboard → Project Settings → API." : ""),
      construction: { ok: constructionOk, message: constructionMessage },
      autoRepair: {
        ok: autoRepair.ok,
        applied: autoRepair.applied ?? 0,
        ...(autoRepair.errors && autoRepair.errors.length > 0 && { errors: autoRepair.errors }),
      },
    },
    { status: 200 }
  );
}
