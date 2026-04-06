"use client";

import * as React from "react";
import { keepPreviousData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HotToaster } from "@/components/hot-toast-root";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
            placeholderData: keepPreviousData,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <HotToaster />
      <Toaster position="bottom-right" closeButton />
    </QueryClientProvider>
  );
}
