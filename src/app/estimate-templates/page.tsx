import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, PageLayout } from "@/components/base";
import { listEstimateTemplates } from "@/lib/estimate-templates-db";
import { EstimateTemplatesClient } from "./estimate-templates-client";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EstimateTemplatesPage() {
  const templates = await listEstimateTemplates({ includeArchived: true }).catch(() => []);

  return (
    <PageLayout
      className="dark"
      header={
        <PageHeader
          title="Estimate Templates"
          description="Reusable proposal scopes for common project types."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/financial">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Financial
                </Link>
              </Button>
            </div>
          }
        />
      }
    >
      <EstimateTemplatesClient templates={templates} />
    </PageLayout>
  );
}
