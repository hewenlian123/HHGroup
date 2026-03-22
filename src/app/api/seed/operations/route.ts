import { NextResponse } from "next/server";
import {
  getProjects,
  createProject,
  getAllTasksWithProject,
  getPunchListAll,
  getAllScheduleWithProject,
  createProjectTask,
  createPunchListItem,
  createProjectScheduleItem,
  getWorkers,
  createWorker,
  getSitePhotos,
  createSitePhoto,
  getInspectionLogs,
  createInspectionLog,
} from "@/lib/data";

const TASK_TITLES = [
  "Install drywall",
  "Electrical inspection",
  "Order materials",
  "Plumbing rough-in",
  "Install flooring",
  "Final painting",
];
const TASK_STATUSES: ("todo" | "in_progress")[] = [
  "todo",
  "in_progress",
  "todo",
  "in_progress",
  "todo",
  "in_progress",
];

const PUNCH_ISSUES = [
  "Paint scratch on bedroom wall",
  "Loose door hinge",
  "Window seal gap",
  "Bathroom tile crack",
  "Missing outlet cover",
];
const PUNCH_LOCATIONS = ["Bedroom", "Kitchen", "Living room", "Bathroom", "Hallway"];

const SCHEDULE_TITLES = ["Demolition", "Framing", "Electrical", "Drywall", "Painting"];

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

const SITE_PHOTO_DESCRIPTIONS = [
  "Framing progress",
  "Electrical rough-in",
  "Drywall installation",
  "Flooring preparation",
  "Painting completed",
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
 * - Seeds tasks, punch list, schedule, site photos, and inspection log
 *   only when their respective tables are empty.
 *
 * Does NOT overwrite existing data.
 */
export async function POST() {
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
          await createWorker({
            name: w.name,
            trade: w.trade,
            dailyRate: w.dailyRate,
            status: "active",
          });
        }
        workersSeeded = true;
      } catch {
        // In dev, ignore worker seeding failures (e.g. missing table/columns).
        workersSeeded = false;
      }
    }

    // 3) Tasks, punch list, schedule — only if empty.
    const [tasks, punchItems, scheduleItems, sitePhotos, inspections] = await Promise.all([
      getAllTasksWithProject().catch(() => []),
      getPunchListAll().catch(() => []),
      getAllScheduleWithProject().catch(() => []),
      getSitePhotos(null).catch(() => []),
      getInspectionLogs().catch(() => []),
    ]);

    const seeded = {
      projects: false,
      workers: workersSeeded,
      tasks: false,
      punchList: false,
      schedule: false,
      sitePhotos: false,
      inspectionLog: false,
    };

    if ((projects?.length ?? 0) >= 3) {
      seeded.projects = true;
    }

    if (tasks.length === 0) {
      const base = new Date();
      for (let i = 0; i < TASK_TITLES.length; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + (i % 7) + 1);
        await createProjectTask({
          project_id: projectId,
          title: TASK_TITLES[i],
          status: TASK_STATUSES[i],
          priority: "medium",
          due_date: d.toISOString().slice(0, 10),
        });
      }
      seeded.tasks = true;
    }

    if (punchItems.length === 0) {
      for (let i = 0; i < PUNCH_ISSUES.length; i++) {
        await createPunchListItem({
          project_id: projectId,
          issue: PUNCH_ISSUES[i],
          location: PUNCH_LOCATIONS[i],
          status: "open",
        });
      }
      seeded.punchList = true;
    }

    if (scheduleItems.length === 0) {
      const base = new Date();
      for (let i = 0; i < SCHEDULE_TITLES.length; i++) {
        const start = new Date(base);
        start.setDate(start.getDate() + i);
        const end = new Date(start);
        end.setDate(end.getDate() + 3);
        await createProjectScheduleItem({
          project_id: projectId,
          title: SCHEDULE_TITLES[i],
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          status: "planned",
        });
      }
      seeded.schedule = true;
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
