import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TABLE_NAME = "worker_reimbursements";

/**
 * DELETE: Remove a worker reimbursement by id.
 * Returns 204 on success, 404 if not found, 500 on error.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Missing id." }, { status: 400 });
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
