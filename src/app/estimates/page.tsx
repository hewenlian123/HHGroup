import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getEstimateList } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

export default function EstimatesListPage() {
  const list = getEstimateList();

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Estimates"
        description="Manage cost-code estimates."
        actions={
          <Button asChild variant="ghost" className="rounded-lg text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800" size="default">
            <Link href="/estimates/new">
              <Plus className="h-4 w-4 mr-2" />
              New Estimate
            </Link>
          </Button>
        }
      />
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-zinc-200/40 dark:border-border/60 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Estimate #</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Project</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right tabular-nums">Total</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id} className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-zinc-50/30 dark:hover:bg-muted/5">
                <TableCell className="font-medium">
                  <Link href={`/estimates/${row.id}`} className="text-foreground hover:underline">
                    {row.number}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground">{row.client}</TableCell>
                <TableCell className="text-foreground">{row.project}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "Draft" ? "secondary" : "outline"} className="text-[10px] font-medium">
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium text-foreground">
                  ${row.total.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.updatedAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
