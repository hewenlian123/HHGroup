"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window as Window & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = React.useState(false);
  const [showIOSHint, setShowIOSHint] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [installError, setInstallError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const key = "hh-pwa-install-dismissed";
    try {
      if (window.localStorage.getItem(key) === "1") setDismissed(true);
    } catch {
      // ignore
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed) setTimeout(() => setShowInstall(true), 2000);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstall(false);
      setShowIOSHint(false);
    };

    if (isStandalone()) {
      setShowInstall(false);
      setShowIOSHint(false);
      return;
    }

    if (isIOS()) {
      if (!dismissed) {
        const t = setTimeout(() => setShowIOSHint(true), 2000);
        return () => clearTimeout(t);
      }
      return;
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [dismissed]);

  const handleInstall = async () => {
    setInstallError(null);
    if (!deferredPrompt) {
      setInstallError("Install not available in this browser. Try Chrome on Android or desktop, or use the browser menu → Install app.");
      return;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstall(false);
        setDeferredPrompt(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Install failed.";
      setInstallError(msg);
    }
  };

  const handleDismiss = () => {
    setShowInstall(false);
    setShowIOSHint(false);
    setInstallError(null);
    setDismissed(true);
    try {
      window.localStorage.setItem("hh-pwa-install-dismissed", "1");
    } catch {
      // ignore
    }
  };

  if (!showInstall && !showIOSHint) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-2)]",
        "md:left-auto md:right-4 md:max-w-sm"
      )}
      role="dialog"
      aria-label="Install app"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {showIOSHint ? (
            <>
              <p className="text-sm font-medium text-foreground">Install HH Construction</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap <Share className="inline h-3.5 w-3.5" /> Share → &quot;Add to Home Screen&quot; to install the app.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Install HH Construction</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Install the app for a better experience and quick access from your home screen.
              </p>
              {installError && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="alert">
                  {installError}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showIOSHint ? (
            <Button size="sm" variant="outline" onClick={handleDismiss} className="h-9" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={handleDismiss} className="h-9" aria-label="Not now">
                Not now
              </Button>
              <Button size="sm" onClick={handleInstall} className="h-9" aria-label="Install app">
                <Download className="h-4 w-4 mr-1" />
                Install
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
