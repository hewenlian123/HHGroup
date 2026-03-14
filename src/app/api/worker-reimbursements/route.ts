import { NextResponse } from "next/server";
import { getWorkerReimbursements } from "@/lib/worker-reimbursements-db";
import { supabase } from "@/lib/supabase";
import type { WorkerReimbursement } from "@/lib/worker-reimbursements-db";

/** Force fresh list so status updates appear immediately */
export const dynamic = "force-dynamic";

/**
 * GET: List worker reimbursements from worker_reimbursements table only.
 * SELECT * FROM worker_reimbursements ORDER BY created_at DESC, then filter to status = 'pending'.
 * Paid reimbursements do not appear; list reflects database status.
 * Project names are resolved from projects table so Project column shows name, not UUID.
 */
export async function GET() {
  try {
    const all = await getWorkerReimbursements();
    const list: WorkerReimbursement[] = all.filter((r) => r.status === "pending");

    const projectIds = Array.from(new Set(list.map((r) => r.projectId).filter(Boolean))) as string[];
    if (projectIds.length > 0 && supabase) {
      const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
      const nameById = new Map(((projects ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? null]));
      for (const row of list) {
        if (row.projectId) row.projectName = nameById.get(row.projectId) ?? null;
      }
    }

    const sorted = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ reimbursements: sorted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ message }, { status: 500 });
  }
}
