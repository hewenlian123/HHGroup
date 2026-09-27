import { NeoMobileCard, NeoTable, PageHeader, PageLayout, SectionHeader } from "@/components/base";
import { getCostCodes } from "@/lib/data";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { TYPO } from "@/lib/typography";

export const dynamic = "force-dynamic";

export default function CostCodesPage() {
  const costCodes = getCostCodes();

  return (
    <PageLayout
      header={
        <PageHeader
          title="Cost Codes"
          description="Default cost code list for General Contractor estimating. Used in estimate line items and category selection."
        />
      }
    >
      <section className="space-y-3" data-testid="cost-code-records">
        <SectionHeader title="Default cost codes" />
        <div className="space-y-2 md:hidden" data-testid="cost-code-cards">
          {costCodes.map((costCode) => (
            <NeoMobileCard key={costCode.code} className="flex min-h-[64px] flex-col gap-1 p-3">
              <span className={TYPO.tableHeader}>Code</span>
              <span className="text-hh-table-cell font-medium tabular-nums text-[var(--hh-text-primary)]">
                {costCode.code}
              </span>
              <span className={TYPO.tableHeader}>Label</span>
              <span className="text-hh-table-cell text-[var(--hh-text-primary)]">
                {costCode.name}
              </span>
            </NeoMobileCard>
          ))}
        </div>
        <NeoTable className="hidden md:block" data-testid="cost-code-table">
          <thead>
            <tr>
              <th className={`h-9 px-3 text-left ${TYPO.tableHeader}`}>Code</th>
              <th className={`h-9 px-3 text-left ${TYPO.tableHeader}`}>Label</th>
            </tr>
          </thead>
          <tbody>
            {costCodes.map((costCode) => (
              <tr key={costCode.code} className={listTableRowStaticClassName}>
                <td className="h-11 px-3 py-0 text-hh-table-cell font-medium tabular-nums text-[var(--hh-text-primary)]">
                  {costCode.code}
                </td>
                <td className="h-11 px-3 py-0 text-hh-table-cell text-[var(--hh-text-primary)]">
                  {costCode.name}
                </td>
              </tr>
            ))}
          </tbody>
        </NeoTable>
      </section>
    </PageLayout>
  );
}
