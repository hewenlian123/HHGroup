import { PageLayout } from "@/components/base/page-layout";
import { getProjects, getWorkers } from "@/lib/data";

import { WorkerAdvancesClient } from "./worker-advances-client";

export const dynamic = "force-dynamic";

export default async function WorkerAdvancesPage() {
  const [workers, projects] = await Promise.all([getWorkers(), getProjects()]);

  return (
    <PageLayout header={null}>
      <div className="page-container page-stack py-6">
        <WorkerAdvancesClient
          workers={workers.map((w) => ({ id: w.id, name: w.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </PageLayout>
  );
}

