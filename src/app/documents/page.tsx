import {
  PageLayout,
  PageHeader,
} from "@/components/base";
import { getDocuments, getProjects } from "@/lib/data";
import { DocumentsListClient } from "./documents-list-client";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ search?: string; project_id?: string; file_type?: string; date_from?: string; date_to?: string }>;
};

export default async function DocumentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = {
    search: sp.search ?? undefined,
    project_id: sp.project_id ?? undefined,
    file_type: (sp.file_type as import("@/lib/documents-db").DocumentFileType) ?? undefined,
    date_from: sp.date_from ?? undefined,
    date_to: sp.date_to ?? undefined,
  };
  const [documents, projects] = await Promise.all([
    getDocuments(filters),
    getProjects(),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Documents"
          description="Project files, receipts, PDFs, subcontract documents, and photos."
        />
      }
    >
      <DocumentsListClient documents={documents} projects={projectOptions} />
    </PageLayout>
  );
}
