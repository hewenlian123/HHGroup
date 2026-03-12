export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-background">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Offline Mode</h1>
        <p className="mt-2 text-sm text-muted-foreground lg:text-base">
          Connection lost.
          <br />
          Please reconnect to continue.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          You can try again once your device is back online.
        </p>
      </div>
    </div>
  );
}
