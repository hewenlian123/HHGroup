"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import {
  AUTH_BODY_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AUTH_META_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_TITLE_CLASS,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";

function pinDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function UnlockForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || pin.length !== 6) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      message?: string;
    } | null;
    setPending(false);
    if (!response?.ok) {
      setPin("");
      setError(body?.message || "Unable to unlock with that PIN.");
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <section className={`${AUTH_PANEL_CLASS} max-w-[390px]`}>
      <div className="flex h-hh-touch w-hh-touch items-center justify-center rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-primary)]">
        <KeyRound className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <h1 className={`mt-hh-5 ${AUTH_TITLE_CLASS}`}>Quick Unlock</h1>
      <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>
        Your Supabase session is still active. Enter this device’s 6-digit PIN.
      </p>

      <form className="mt-hh-6 space-y-hh-4" onSubmit={onSubmit}>
        {error ? (
          <div role="alert" aria-live="assertive" className={AUTH_ERROR_CLASS}>
            {error}
          </div>
        ) : null}
        <div className="space-y-hh-1">
          <label htmlFor="quick-unlock-pin" className={AUTH_LABEL_CLASS}>
            6-digit PIN
          </label>
          <input
            id="quick-unlock-pin"
            aria-describedby="quick-unlock-hint"
            autoComplete="one-time-code"
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            type="password"
            className={`${AUTH_INPUT_CLASS} hh-fin min-h-hh-touch px-hh-4 text-center text-hh-financial-total tracking-normal`}
            value={pin}
            onChange={(event) => setPin(pinDigits(event.target.value))}
            disabled={pending}
          />
          <p id="quick-unlock-hint" className={AUTH_META_CLASS}>
            PIN cannot restore an expired or signed-out session.
          </p>
        </div>
        <Button className="min-h-11 w-full" type="submit" disabled={pending || pin.length !== 6}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Unlocking" : "Unlock"}
        </Button>
      </form>

      <form action="/logout" method="post">
        <button type="submit" className={`${AUTH_LINK_CLASS} mt-hh-4 w-full justify-center`}>
          Use password instead
        </button>
      </form>
    </section>
  );
}
