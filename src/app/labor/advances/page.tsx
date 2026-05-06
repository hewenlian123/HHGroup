import { getLaborWorkersList, getProjects } from "@/lib/data";

import { WorkerAdvancesClient } from "./worker-advances-client";

export const dynamic = "force-dynamic";

export default async function WorkerAdvancesPage() {
  const [workers, projects] = await Promise.all([getLaborWorkersList(), getProjects()]);

  return (
    <WorkerAdvancesClient
      workers={workers.map((w) => ({ id: w.id, name: w.name }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
