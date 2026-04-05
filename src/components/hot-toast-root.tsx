"use client";

import { Toaster } from "react-hot-toast";

export function HotToaster() {
  return (
    <Toaster
      position="top-center"
      containerClassName="!top-4"
      toastOptions={{
        duration: 2600,
        className:
          "!rounded-md !border !border-border/60 !bg-background !px-3 !py-2 !text-sm !text-foreground !shadow-sm",
        style: { maxWidth: "min(420px, calc(100vw - 2rem))" },
        success: {
          iconTheme: { primary: "var(--foreground)", secondary: "var(--background)" },
        },
        error: {
          iconTheme: { primary: "var(--foreground)", secondary: "var(--background)" },
        },
      }}
    />
  );
}
