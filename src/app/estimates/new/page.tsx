import { getCostCodes } from "@/lib/data";
import { getCompanyProfile } from "@/lib/company-profile";
import { listEstimateTemplates } from "@/lib/estimate-templates-db";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { NewEstimateEditor } from "./new-estimate-editor";

export const dynamic = "force-dynamic";

async function getDefaultTaxPct(): Promise<number> {
  const client = getServerSupabaseInternalNoStore();
  if (!client) return 0;
  try {
    const profile = await getCompanyProfile(client);
    const pct = Number(profile?.default_tax_pct ?? 0);
    return Number.isFinite(pct) && pct >= 0 ? pct : 0;
  } catch {
    return 0;
  }
}

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { templateId } = await searchParams;
  const costCodes = getCostCodes();
  const [defaultTaxPct, templates] = await Promise.all([
    getDefaultTaxPct(),
    listEstimateTemplates({ includeArchived: false }).catch(() => []),
  ]);
  return (
    <div className="estimate-builder-page page-stack py-3 md:py-4">
      <NewEstimateEditor
        costCodes={costCodes}
        initialDefaultTaxPct={defaultTaxPct}
        templates={templates}
        initialTemplateId={templateId}
      />
    </div>
  );
}
