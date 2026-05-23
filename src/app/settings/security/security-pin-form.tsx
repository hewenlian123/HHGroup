"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LoadingState,
  NeoActionFooter,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoPanel,
  neoFormErrorClassName,
  neoFormNoticeClassName,
} from "@/components/base";

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
    <NeoPanel
      className="max-w-xl"
      eyebrow="App unlock"
      title={initialized === false ? "Set Initial PIN" : "Change PIN"}
      description="Keep workspace access compact, explicit, and owner-controlled."
      bodyClassName="p-5 sm:p-6"
    >
      {loading ? (
        <LoadingState text="Loading security settings" className="min-h-[140px]" />
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {message ? (
            <div role="status" className={neoFormNoticeClassName}>
              {message}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className={neoFormErrorClassName}>
              {error}
            </div>
          ) : null}

          {initialized ? (
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="current-pin">Current PIN</NeoFieldLabel>
              <NeoInput
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
            <p className={neoFormNoticeClassName}>No app unlock PIN is initialized yet.</p>
          )}

          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="new-pin">New PIN</NeoFieldLabel>
              <NeoInput
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
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="confirm-new-pin">Confirm New PIN</NeoFieldLabel>
              <NeoInput
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
          </NeoFormGrid>

          <NeoActionFooter className="static -mx-5 mb-[-1.5rem] px-5 sm:-mx-6 sm:mb-[-1.5rem] sm:px-6">
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
          </NeoActionFooter>
        </form>
      )}
    </NeoPanel>
  );
}
