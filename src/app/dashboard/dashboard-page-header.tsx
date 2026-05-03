/** Static dashboard title row — renders immediately with the route shell (no data). */
export function DashboardPageHeader() {
  return (
    <>
      <header className="flex h-11 shrink-0 items-center md:hidden">
        <h1 className="text-base font-medium tracking-tight text-text-primary dark:text-foreground">
          Dashboard
        </h1>
      </header>
      <header className="hidden flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:flex">
        <div className="min-w-0">
          <h1 className="text-xl font-medium tracking-tight text-text-primary dark:text-foreground">
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary dark:text-muted-foreground">
            Company overview
          </p>
        </div>
        <span className="shrink-0 self-start rounded-md border border-gray-100 bg-white px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-text-secondary dark:border-border sm:self-auto">
          {new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </header>
    </>
  );
}
