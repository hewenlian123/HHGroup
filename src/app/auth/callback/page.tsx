"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background p-6 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}
