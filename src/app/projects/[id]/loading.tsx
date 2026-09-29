import { Skeleton } from "@/components/ui/skeleton";

/** Route shell for a project workspace. Overview data still loads on the server after this paints. */
export default function LoadingProjectDetail() {
  return (
    <div className="page-container py-6">
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="flex gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24" />
          ))}
        </div>
        <div className="grid gap-4 pt-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
