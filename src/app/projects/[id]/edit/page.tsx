import { redirect } from "next/navigation";

/**
 * Project edit placeholder: redirect to project detail.
 * Full edit UI can be added here later; for now "Edit project" in the actions menu
 * no longer 404s and users land on the project overview.
 */
export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
