export function EmptyState({
  title = "No data",
  description = "Nothing to display.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300/70 bg-muted/20 px-4 py-8 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
