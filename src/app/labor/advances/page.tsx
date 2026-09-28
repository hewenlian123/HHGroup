import { SystemState } from "@/components/ui/system-state";
import { getLaborWorkers, getLaborWorkersList, getProjects } from "@/lib/data";
import { createServerSupabaseClient } from "@/lib/supabase-server";

import { WorkerAdvancesClient } from "./worker-advances-client";

export const dynamic = "force-dynamic";

export default async function WorkerAdvancesPage() {
  const projectSupabase = await createServerSupabaseClient();
  if (!projectSupabase) throw new Error("Authenticated project session is not configured.");

  const options = await (async () => {
    try {
      return await Promise.all([
        getLaborWorkersList(projectSupabase),
        getLaborWorkers(projectSupabase),
        getProjects(projectSupabase),
      ]);
    } catch {
      return null;
    }
  })();
  if (!options)
    return (
      <div className="page-container py-6">
        <SystemState
          title="Worker advances unavailable"
          description="Worker and project options could not be confirmed. Reload to try again."
          tone="danger"
        />
      </div>
    );
  const [laborWorkers, profileWorkers, projects] = options;

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
