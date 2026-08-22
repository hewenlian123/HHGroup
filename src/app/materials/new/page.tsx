import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoPanel,
  NeoSelect,
  NeoTextarea,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { getAllCustomers } from "@/lib/customers-db";
import { getProjects } from "@/lib/projects-db";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";
import { createMaterialSelectionAction } from "../actions";
import { MaterialSelectionLinkedRecordCombobox } from "./material-selection-linked-record-combobox";

export const dynamic = "force-dynamic";

type ProjectOptionSource = Awaited<ReturnType<typeof getProjects>>[number];

function projectUpdatedTime(project: ProjectOptionSource): number {
  const time = Date.parse(project.updated_at ?? project.updated ?? "");
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function sortProjectsForSelection(projects: ProjectOptionSource[]): ProjectOptionSource[] {
  const hasUpdatedDate = projects.some((project) => Number.isFinite(projectUpdatedTime(project)));
  return [...projects].sort((a, b) => {
    if (hasUpdatedDate) {
      const byUpdated = projectUpdatedTime(b) - projectUpdatedTime(a);
      if (byUpdated !== 0) return byUpdated;
    }
    return a.name.localeCompare(b.name);
  });
}

export default async function NewMaterialSelectionPage() {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const supabase = getServerSupabaseAdmin();
  if (!supabase) throw new Error("Supabase privileged server client is not configured.");

  const [customers, projects] = await Promise.all([getAllCustomers(), getProjects(supabase)]);
  const customerOptions = [...customers]
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((customer) => ({
      value: customer.id,
      label: customer.name,
      searchText: [customer.company_name, customer.email, customer.phone].filter(Boolean).join(" "),
    }));
  const projectOptions = sortProjectsForSelection(projects).map((project) => ({
    value: project.id,
    label: project.name,
    searchText: [project.client, project.address, project.status].filter(Boolean).join(" "),
  }));

  return (
    <PageLayout
      divider={false}
      className="md:max-w-4xl"
      header={
        <PageHeader
          title="New Material Selection"
          description="Create a customer/project approval sheet."
          actions={
            <Button variant="outline" size="sm" className="rounded-hh-compact" asChild>
              <Link href="/materials">
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                Back
              </Link>
            </Button>
          }
        />
      }
    >
      <NeoPanel bodyClassName="p-4">
        <form action={createMaterialSelectionAction} className="space-y-4">
          <div className="space-y-1.5">
            <NeoFieldLabel htmlFor="material-selection-title" required>
              Title
            </NeoFieldLabel>
            <NeoInput
              id="material-selection-title"
              name="title"
              placeholder="e.g. Smith Residence finish selections"
              required
            />
          </div>

          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="material-selection-customer">Customer</NeoFieldLabel>
              <MaterialSelectionLinkedRecordCombobox
                id="material-selection-customer"
                name="customerId"
                label="Customer"
                options={customerOptions}
                optionalLabel="No customer"
                placeholder="Select customer"
                searchLabel="Search customers"
                searchPlaceholder="Search customers..."
                emptyText="No matching customers"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="material-selection-project">Project</NeoFieldLabel>
              <MaterialSelectionLinkedRecordCombobox
                id="material-selection-project"
                name="projectId"
                label="Project"
                options={projectOptions}
                optionalLabel="No project"
                placeholder="Select project"
                searchLabel="Search projects"
                searchPlaceholder="Search projects..."
                emptyText="No matching projects"
              />
            </div>
          </NeoFormGrid>

          <div className="space-y-1.5">
            <NeoFieldLabel htmlFor="material-selection-status">Status</NeoFieldLabel>
            <NeoSelect
              id="material-selection-status"
              name="status"
              defaultValue="draft"
              className="min-h-11 md:min-h-10"
            >
              <option value="draft">Draft</option>
              <option value="shared">Shared</option>
              <option value="approved">Approved</option>
            </NeoSelect>
          </div>

          <div className="space-y-1.5">
            <NeoFieldLabel htmlFor="material-selection-notes">Notes</NeoFieldLabel>
            <NeoTextarea
              id="material-selection-notes"
              name="notes"
              rows={4}
              placeholder="Optional customer approval notes"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="outline" className="rounded-hh-compact" asChild>
              <Link href="/materials">Cancel</Link>
            </Button>
            <Button type="submit" className="rounded-hh-compact">
              Create Selection
            </Button>
          </div>
        </form>
      </NeoPanel>
    </PageLayout>
  );
}
