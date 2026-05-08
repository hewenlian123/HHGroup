import { getLaborWorkers, getLaborWorkersList, getProjects } from "@/lib/data";

import { WorkerAdvancesClient } from "./worker-advances-client";

export const dynamic = "force-dynamic";

export default async function WorkerAdvancesPage() {
  const [laborWorkers, profileWorkers, projects] = await Promise.all([
    getLaborWorkersList().catch(() => []),
    getLaborWorkers().catch(() => []),
    getProjects(),
  ]);
  const workersById = new Map<string, { id: string; name: string }>();
  for (const w of [...laborWorkers, ...profileWorkers]) {
    if (!w.id) continue;
    workersById.set(w.id, { id: w.id, name: w.name });
  }

  return (
    <WorkerAdvancesClient
      workers={[...workersById.values()].sort((a, b) => a.name.localeCompare(b.name))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
