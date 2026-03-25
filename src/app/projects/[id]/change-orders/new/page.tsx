import { redirect } from "next/navigation";
import { getProjectById } from "@/lib/data";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { NewChangeOrderForm } from "./new-change-order-form";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    project = await getProjectById(projectId);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/new`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "project")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  if (!project) redirect("/projects");
  return (
    <div className="page-container py-6">
      <SetBreadcrumbEntityTitle label={project.name} />
      <NewChangeOrderForm projectId={projectId} projectName={project.name} />
    </div>
  );
}
