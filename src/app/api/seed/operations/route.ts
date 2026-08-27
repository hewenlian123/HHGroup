import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { guardDangerousMaintenanceRequest } from "@/lib/production-safety";
import {
  SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE,
  getServerSupabaseAdmin,
} from "@/lib/supabase-server";
import { getProjects, createProject, getWorkers, createWorker } from "@/lib/data";

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

/**
 * POST /api/seed/operations
 * Development seed for operations module.
 *
 * - Creates 3 demo projects if fewer than 3 exist (does not touch existing ones).
 * - Inserts workers only if workers table is empty.
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

    const seeded = {
      projects: false,
      workers: workersSeeded,
    };

    if ((projects?.length ?? 0) >= 3) {
      seeded.projects = true;
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
