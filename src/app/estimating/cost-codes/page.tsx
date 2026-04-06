import { PageHeader } from "@/components/page-header";
import { getCostCodes } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function CostCodesPage() {
  const costCodes = getCostCodes();

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Cost Codes"
        description="Default cost code list for General Contractor estimating. Used in estimate line items and category selection."
      />
      <section>
        <h2 className="mb-4 text-base font-semibold text-foreground">Default cost codes</h2>
        <div className="overflow-x-auto rounded-sm border border-gray-100 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-white dark:border-border/60 dark:bg-muted/20">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Label
                </th>
              </tr>
            </thead>
            <tbody>
              {costCodes.map((cc) => (
                <tr
                  key={cc.code}
                  className="border-b border-gray-100/80 transition-colors last:border-0 hover:bg-[#F9FAFB] dark:border-border/30 dark:hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5 font-medium tabular-nums">{cc.code}</td>
                  <td className="px-4 py-2.5 text-foreground">{cc.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
