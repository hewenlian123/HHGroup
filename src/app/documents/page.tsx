import { PageLayout, PageHeader, Divider } from "@/components/base";
import { getDocumentsPaged, getProjectsDashboard } from "@/lib/data";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { DocumentsListClient } from "./documents-list-client";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    search?: string;
    project_id?: string;
    file_type?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
  }>;
};

export default async function DocumentsPage({ searchParams }: Props) {
  const supabase = await createServerSupabaseClient({ noStore: true });
  if (!supabase) throw new Error("Authenticated Documents session is not configured.");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const filters = {
    search: sp.search ?? undefined,
    project_id: sp.project_id ?? undefined,
    file_type: (sp.file_type as import("@/lib/documents-db").DocumentFileType) ?? undefined,
    date_from: sp.date_from ?? undefined,
    date_to: sp.date_to ?? undefined,
  };
  const [{ rows: documents, total }, projects] = await Promise.all([
    getDocumentsPaged({ ...filters, page, pageSize: 20 }, supabase),
    getProjectsDashboard(500, supabase),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      divider={false}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Documents"
            description="Project files, receipts, PDFs, subcontract documents, and photos."
          />
          <Divider />
        </div>
      }
    >
      <DocumentsListClient documents={documents} projects={projectOptions} total={total} />
    </PageLayout>
  );
}
