import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEstimateAction } from "./actions";
import { ArrowLeft } from "lucide-react";

export default function NewEstimatePage() {
  return (
    <div className="mx-auto max-w-[600px] flex flex-col gap-8 p-6">
      <div className="flex items-center gap-4">
        <Link href="/estimates" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
      <PageHeader title="New Estimate" description="Create a new cost-code estimate." />
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
        <CardHeader className="px-0 pb-4">
          <CardTitle className="text-base font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <form action={createEstimateAction} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="clientName" className="text-sm font-medium text-foreground">Client name</label>
              <Input
                id="clientName"
                name="clientName"
                placeholder="Client or company name"
                className="rounded-lg border-zinc-200/60 dark:border-border/60"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="projectName" className="text-sm font-medium text-foreground">Project name</label>
              <Input
                id="projectName"
                name="projectName"
                placeholder="Project name"
                className="rounded-lg border-zinc-200/60 dark:border-border/60"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="address" className="text-sm font-medium text-foreground">Address</label>
              <Input
                id="address"
                name="address"
                placeholder="Site or client address"
                className="rounded-lg border-zinc-200/60 dark:border-border/60"
              />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="submit" className="rounded-lg">
                Create estimate
              </Button>
              <Button type="button" variant="outline" asChild className="rounded-lg border-zinc-200/60">
                <Link href="/estimates">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
