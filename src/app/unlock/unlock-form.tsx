"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

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
    <section className="w-full max-w-[390px] rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] p-6 shadow-[0_28px_80px_rgb(0_0_0_/_0.38)] sm:p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgb(184_147_90_/_0.28)] bg-[rgb(184_147_90_/_0.12)] text-[var(--neo-gold)]">
        <KeyRound className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-white">Quick Unlock</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Your Supabase session is still active. Enter this device’s 6-digit PIN.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-100"
          >
            {error}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="quick-unlock-pin" className="block text-xs font-medium text-zinc-300">
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
            className="min-h-12 w-full rounded-lg border border-white/10 bg-black/20 px-4 text-center text-xl font-semibold tracking-[0.45em] text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
            value={pin}
            onChange={(event) => setPin(pinDigits(event.target.value))}
            disabled={pending}
          />
          <p id="quick-unlock-hint" className="text-xs text-zinc-500">
            PIN cannot restore an expired or signed-out session.
          </p>
        </div>
        <Button className="min-h-11 w-full" type="submit" disabled={pending || pin.length !== 6}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Unlocking" : "Unlock"}
        </Button>
      </form>

      <form action="/logout" method="post">
        <button
          type="submit"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-md text-sm font-medium text-zinc-400 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
        >
          Use password instead
        </button>
      </form>
    </section>
  );
}
