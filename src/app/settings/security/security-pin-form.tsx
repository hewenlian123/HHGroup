"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StatusResponse = {
  ok?: boolean;
  initialized?: boolean;
  message?: string;
};

type SaveResponse = {
  ok?: boolean;
  message?: string;
};

function pinDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function SecurityPinForm() {
  const [initialized, setInitialized] = React.useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = React.useState("");
  const [newPin, setNewPin] = React.useState("");
  const [confirmNewPin, setConfirmNewPin] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/settings/security/pin", {
        cache: "no-store",
      }).catch(() => null);
      if (cancelled) return;
      setLoading(false);
      if (!response?.ok) {
        const body = (await response?.json().catch(() => null)) as StatusResponse | null;
        setError(body?.message || "Unable to load security settings.");
        return;
      }
      const body = (await response.json().catch(() => null)) as StatusResponse | null;
      setInitialized(Boolean(body?.initialized));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    setError(null);

    if (!/^\d{4}$/.test(newPin)) {
      setError("New PIN must be 4 digits.");
      return;
    }
    if (newPin !== confirmNewPin) {
      setError("PIN confirmation does not match.");
      return;
    }
    if (initialized && !/^\d{4}$/.test(currentPin)) {
      setError("Invalid current PIN.");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/settings/security/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPin: initialized ? currentPin : undefined,
        newPin,
        confirmNewPin,
      }),
    }).catch(() => null);
    setSaving(false);

    const body = (await response?.json().catch(() => null)) as SaveResponse | null;
    if (!response?.ok) {
      setError(body?.message || "Unable to save PIN.");
      return;
    }

    setInitialized(true);
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setMessage("PIN updated");
  }

  return (
    <Card className="max-w-xl border-gray-100 p-5 dark:border-border sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          App unlock
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-normal text-foreground">
          {initialized === false ? "Set Initial PIN" : "Change PIN"}
        </h2>
      </div>

      {loading ? (
        <div className="flex min-h-[140px] items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading security settings
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {message ? (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              {message}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            >
              {error}
            </div>
          ) : null}

          {initialized ? (
            <div className="space-y-2">
              <Label htmlFor="current-pin">Current PIN</Label>
              <Input
                id="current-pin"
                autoComplete="off"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                type="password"
                value={currentPin}
                onChange={(event) => setCurrentPin(pinDigits(event.target.value))}
              />
            </div>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              No app unlock PIN is initialized yet.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN</Label>
              <Input
                id="new-pin"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                type="password"
                value={newPin}
                onChange={(event) => setNewPin(pinDigits(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-pin">Confirm New PIN</Label>
              <Input
                id="confirm-new-pin"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                type="password"
                value={confirmNewPin}
                onChange={(event) => setConfirmNewPin(pinDigits(event.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Saving
                </>
              ) : (
                "Save PIN"
              )}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
