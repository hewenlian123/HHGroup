import { NextResponse } from "next/server";
import {
  requireSupabaseOwnerOrAdmin,
  requireSupabaseOwnerOrAdminWithClient,
} from "@/lib/auth-boundary";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { updateWorkerReimbursement } from "@/lib/worker-reimbursements-db";

/**
 * DELETE: Remove a worker reimbursement by id.
 * Deletes by primary key only; does not depend on worker_id or project_id, so orphaned records (null worker/project) can be deleted.
 * When SUPABASE_DATABASE_URL is set, uses direct SQL so the row is removed from the same DB the list reads from.
 * Returns 204 on success, 404 if not found, 500 on error.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  void params;
  return NextResponse.json(
    { message: "BLOCKED: obligation deletion requires canonical workflow authority." },
    { status: 409 }
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(
    request,
    getServerSupabaseInternalNoStore
  );
  if (!guard.ok) return guard.response;

  const supabase = guard.client;
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 500 });
  }

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Missing id." }, { status: 400 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });

    if (body.status !== undefined) {
      return NextResponse.json(
        { message: "Edit cannot change reimbursement status. Continue to Payment." },
        { status: 400 }
      );
    }

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
