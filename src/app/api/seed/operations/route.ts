import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { guardDangerousMaintenanceRequest } from "@/lib/production-safety";
import {
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
  getServerSupabaseAdmin,
} from "@/lib/supabase-server";
import {
  getProjects,
  createProject,
  getWorkers,
  createWorker,
  getSitePhotos,
  getInspectionLogs,
  createInspectionLog,
} from "@/lib/data";

const DEMO_PROJECTS: Array<{
  name: string;
  client?: string;
  status: "active" | "pending" | "completed";
  address?: string;
}> = [
  {
    name: "Ala Moana Store Renovation",
    client: "Body Balance",
    status: "active",
    address: "1450 Ala Moana Blvd Honolulu HI",
  },
  {
    name: "Kapolei Warehouse Build",
    client: "Solidcore Supply",
    status: "active",
  },
  {
    name: "Waikiki Condo Remodel",
    client: "Private Client",
    status: "active",
  },
];

const DEMO_WORKERS: Array<{ name: string; trade: string; dailyRate: number }> = [
  { name: "Lin Xiangqiang", trade: "Carpenter", dailyRate: 220 },
  { name: "Xiao Wu", trade: "Painter", dailyRate: 200 },
  { name: "Hai Jun", trade: "Electrician", dailyRate: 240 },
  { name: "Tom Lee", trade: "Plumber", dailyRate: 230 },
  { name: "Mike Chen", trade: "Labor", dailyRate: 180 },
];

const INSPECTION_TEMPLATES: Array<{ type: string; status: "passed" | "failed" | "pending" }> = [
  { type: "Electrical inspection", status: "passed" },
  { type: "Framing inspection", status: "passed" },
  { type: "Plumbing inspection", status: "failed" },
  { type: "Safety inspection", status: "passed" },
  { type: "Final inspection", status: "pending" },
];

/**
 * POST /api/seed/operations
 * Development seed for operations module.
 *
 * - Creates 3 demo projects if fewer than 3 exist (does not touch existing ones).
 * - Inserts workers only if workers table is empty.
 * - Seeds site photos and inspection log only when their respective tables are empty.
 *
 * Does NOT overwrite existing data.
 */
export async function POST(request: Request) {
  const strictGuard = await requireSupabaseOwnerOrAdmin(request);
  if (!strictGuard.ok) return strictGuard.response;

  const blocked = guardDangerousMaintenanceRequest(request);
  if (blocked) return blocked;

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE },
      { status: 503 }
    );
  }

  try {
    let projects = await getProjects();

    // 1) Ensure we have at least 3 demo projects (without overwriting existing).
    if ((projects?.length ?? 0) < 3) {
      const existingByName = new Set((projects ?? []).map((p) => p.name));
      for (const demo of DEMO_PROJECTS) {
        if (!existingByName.has(demo.name)) {
          await createProject({
            name: demo.name,
            budget: 100000,
            status: demo.status,
            client: demo.client,
            address: demo.address,
          });
        }
      }
      projects = await getProjects();
    }

    // Use the first project for dependent seed records.
    const projectId = projects && projects[0] ? projects[0].id : undefined;
    if (!projectId) {
      throw new Error("Failed to create or load demo projects.");
    }

    // 2) Workers — only if empty.
    const workers = await getWorkers().catch(() => []);
    let workersSeeded = false;
    if (!workers.length) {
      try {
        for (const w of DEMO_WORKERS) {
          await createWorker(
            {
              name: w.name,
              trade: w.trade,
              dailyRate: w.dailyRate,
              status: "active",
            },
            admin
          );
        }
        workersSeeded = true;
      } catch {
        // In dev, ignore worker seeding failures (e.g. missing table/columns).
        workersSeeded = false;
      }
    }

    const [sitePhotos, inspections] = await Promise.all([
      getSitePhotos(null).catch(() => []),
      getInspectionLogs().catch(() => []),
    ]);

    const seeded = {
      projects: false,
      workers: workersSeeded,
      sitePhotos: false,
      inspectionLog: false,
    };

    if ((projects?.length ?? 0) >= 3) {
      seeded.projects = true;
    }

    // 4) Site photos — seeding disabled; demo paths (site-photos/demo-*.jpg) have no files in storage and would 404.
    // When the list is empty, the UI shows "No photos yet. Upload a photo to get started."
    if (sitePhotos.length === 0) {
      seeded.sitePhotos = false;
    }

    // 5) Inspection log — only if empty.
    if (inspections.length === 0) {
      try {
        const base = new Date();
        for (let i = 0; i < INSPECTION_TEMPLATES.length; i++) {
          const t = INSPECTION_TEMPLATES[i];
          const d = new Date(base);
          d.setDate(d.getDate() - (INSPECTION_TEMPLATES.length - i));
          await createInspectionLog({
            project_id: projectId,
            inspection_type: t.type,
            inspector: "Inspector " + (i + 1),
            inspection_date: d.toISOString().slice(0, 10),
            status: t.status,
            notes: null,
          });
        }
        seeded.inspectionLog = true;
      } catch {
        // Ignore inspection seed failures in dev.
        seeded.inspectionLog = false;
      }
    }

    return NextResponse.json({
      ok: true as const,
      seeded,
      projectId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false as const, message: msg }, { status: 500 });
  }
}
