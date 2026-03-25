import Link from "next/link";

/** Minimal full-page fallback when a server route cannot load required data (avoids error boundary). */
export function ServerDataLoadFallback({
  message,
  backHref,
  backLabel = "Back",
}: {
  message: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-[40vh] p-6">
      <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="alert">
        {message}
      </p>
      <Link
        href={backHref}
        className="mt-4 inline-block text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {backLabel}
      </Link>
    </div>
  );
}
