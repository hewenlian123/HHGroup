export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground dark:border-border">
      {text}
    </div>
  );
}
