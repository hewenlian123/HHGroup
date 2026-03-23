import { redirect } from "next/navigation";
import { getProjectById } from "@/lib/data";
import { NewChangeOrderForm } from "./new-change-order-form";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const project = await getProjectById(projectId);
  if (!project) redirect("/projects");
  return (
    <div className="page-container py-6">
      <SetBreadcrumbEntityTitle label={project.name} />
      <NewChangeOrderForm projectId={projectId} projectName={project.name} />
    </div>
  );
}
