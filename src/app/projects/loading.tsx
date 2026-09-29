import { PageHeader } from "@/components/base/page-layout";
import { Skeleton } from "@/components/ui/skeleton";

/** Route shell for the projects list so a sidebar or bottom-nav click paints before the RSC payload. */
export default function LoadingProjects() {
  return (
    <div className="min-h-full">
      <div className="page-container page-stack min-w-0 max-w-full py-6">
        <div className="hidden md:block">
          <PageHeader
            title="Projects"
            description="Open a project to review revenue, actual cost, and guarded profit."
          />
        </div>
        <div className="md:hidden">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="mt-4 space-y-2" aria-hidden>
          <Skeleton className="h-10 w-full max-w-md" />
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
