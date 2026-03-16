import { NextResponse } from "next/server";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import postgres from "postgres";

const TABLE_NAME = "worker_reimbursements";

/**
 * DELETE: Remove a worker reimbursement by id.
 * Deletes by primary key only; does not depend on worker_id or project_id, so orphaned records (null worker/project) can be deleted.
 * When SUPABASE_DATABASE_URL is set, uses direct SQL so the row is removed from the same DB the list reads from.
 * Returns 204 on success, 404 if not found, 500 on error.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Missing id." }, { status: 400 });

    const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (dbUrl) {
      const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
      try {
        const deleted = await sql`DELETE FROM public.worker_reimbursements WHERE id = ${id}::uuid RETURNING id`;
        const count = Array.isArray(deleted) ? deleted.length : 0;
        if (count > 0) return new NextResponse(null, { status: 204 });
        return NextResponse.json(
          { message: "Reimbursement not found or already deleted." },
          { status: 404 }
        );
      } finally {
        await sql.end();
      }
    }

    const supabase = getServerSupabaseAdmin();
    if (!supabase) return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq("id", id)
      .select("id");
    if (error) {
      return NextResponse.json(
        { message: error.message ?? "Failed to delete reimbursement." },
        { status: 500 }
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: "Reimbursement not found or already deleted." },
        { status: 404 }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ message }, { status: 500 });
  }
}
