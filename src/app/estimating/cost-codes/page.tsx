import { PageHeader } from "@/components/page-header";
import { getCostCodes } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function CostCodesPage() {
  const costCodes = getCostCodes();

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Cost Codes"
        description="Default cost code list for General Contractor estimating. Used in estimate line items and category selection."
      />
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Default cost codes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/20">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Code</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Label</th>
                </tr>
              </thead>
              <tbody>
                {costCodes.map((cc) => (
                  <tr key={cc.code} className="border-b border-zinc-100/50 dark:border-border/30 last:border-0">
                    <td className="py-2.5 px-4 font-medium tabular-nums">{cc.code}</td>
                    <td className="py-2.5 px-4 text-foreground">{cc.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
