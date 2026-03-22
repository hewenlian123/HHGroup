import { PageHeader } from "@/components/page-header";
import { Divider } from "@/components/base";
import { SectionHeader } from "@/components/section-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingDashboard() {
  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Dashboard" subtitle="Construction operations overview." />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-0 border-b border-zinc-200/70 dark:border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-1 basis-32 flex-col border-r border-zinc-200/70 py-3 pr-4 dark:border-border last:border-r-0"
          >
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="mt-2 h-4 w-24 rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader
                title="Project Health"
                subtitle="Revenue, cost, profit, and margin by project."
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <th key={idx} className="py-2 px-4">
                        <Skeleton className="h-3 w-16 rounded-md" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, r) => (
                    <tr key={r} className="border-b border-zinc-100/50 dark:border-border/30">
                      <td className="py-2 px-4">
                        <Skeleton className="h-4 w-36 rounded-md" />
                      </td>
                      {Array.from({ length: 7 }).map((__, c) => (
                        <td key={c} className="py-2 px-4">
                          <Skeleton className="h-4 w-20 rounded-md" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Divider />

          <section>
            <div className="py-3">
              <SectionHeader
                title="Outstanding Subcontracts"
                subtitle="Subcontracts with balance due."
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="py-2 px-4">
                      <Skeleton className="h-3 w-24 rounded-md" />
                    </th>
                    <th className="py-2 px-4">
                      <Skeleton className="h-3 w-20 rounded-md" />
                    </th>
                    <th className="py-2 px-4">
                      <Skeleton className="h-3 w-16 rounded-md" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-2 px-4">
                        <Skeleton className="h-4 w-36 rounded-md" />
                      </td>
                      <td className="py-2 px-4">
                        <Skeleton className="h-4 w-28 rounded-md" />
                      </td>
                      <td className="py-2 px-4">
                        <Skeleton className="h-4 w-20 rounded-md" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader title="Financial Overview" subtitle="Portfolio snapshot." />
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-zinc-200/70 bg-background px-3 py-2 dark:border-border"
                  >
                    <Skeleton className="h-3 w-24 rounded-md" />
                    <Skeleton className="mt-2 h-4 w-20 rounded-md" />
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-zinc-200/70 bg-muted/10 px-3 py-3 dark:border-border">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="mt-3 h-2 w-full rounded-full" />
                <Skeleton className="mt-3 h-3 w-20 rounded-md" />
                <Skeleton className="mt-2 h-3 w-20 rounded-md" />
              </div>
            </div>
          </section>

          <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
            <div className="px-4 py-3 border-b border-zinc-200/70 dark:border-border bg-muted/20">
              <SectionHeader title="Recent Activity" subtitle="Latest transactions." />
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-40 rounded-md" />
                    <Skeleton className="mt-2 h-3 w-56 rounded-md" />
                  </div>
                  <div className="shrink-0 text-right">
                    <Skeleton className="h-3 w-20 rounded-md" />
                    <Skeleton className="mt-2 h-4 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
