export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
