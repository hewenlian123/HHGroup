import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin, getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { updateWorkerReimbursement } from "@/lib/worker-reimbursements-db";
import postgres from "postgres";

const TABLE_NAME = "worker_reimbursements";

/**
 * DELETE: Remove a worker reimbursement by id.
 * Deletes by primary key only; does not depend on worker_id or project_id, so orphaned records (null worker/project) can be deleted.
 * When SUPABASE_DATABASE_URL is set, uses direct SQL so the row is removed from the same DB the list reads from.
 * Returns 204 on success, 404 if not found, 500 on error.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Missing id." }, { status: 400 });

    const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (dbUrl) {
      const sql = postgres(dbUrl, { max: 1, connect_timeout: 10 });
      try {
        const deleted =
          await sql`DELETE FROM public.worker_reimbursements WHERE id = ${id}::uuid RETURNING id`;
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
    if (!supabase)
      return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });

    const { data, error } = await supabase.from(TABLE_NAME).delete().eq("id", id).select("id");
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Missing id." }, { status: 400 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });

    const amount = body.amount == null ? undefined : Number(body.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ message: "amount is invalid." }, { status: 400 });
    }

    const reimbursement = await updateWorkerReimbursement(
      id,
      {
        workerId: typeof body.workerId === "string" ? body.workerId : undefined,
        projectId:
          typeof body.projectId === "string"
            ? body.projectId || null
            : body.projectId === null
              ? null
              : undefined,
        vendor:
          typeof body.vendor === "string" ? body.vendor : body.vendor === null ? null : undefined,
        amount,
        receiptUrl:
          typeof body.receiptUrl === "string"
            ? body.receiptUrl
            : body.receiptUrl === null
              ? null
              : undefined,
        description:
          typeof body.description === "string"
            ? body.description
            : body.description === null
              ? null
              : undefined,
        status: body.status === "paid" || body.status === "pending" ? body.status : undefined,
        reimbursementDate:
          typeof body.reimbursementDate === "string" ? body.reimbursementDate : undefined,
      },
      supabase
    );

    return NextResponse.json({ reimbursement });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update reimbursement.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
