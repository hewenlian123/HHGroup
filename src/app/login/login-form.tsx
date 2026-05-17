"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type LoginFormProps = {
  redirectTo: string;
  initialError?: string;
  initialMessage?: string;
};

function cleanStatusText(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).trim() || null;
  } catch {
    return value.trim() || null;
  }
}

function normalizePinDigits(value: string): string[] {
  return value.replace(/\D/g, "").slice(0, 4).split("");
}

export function LoginForm({ redirectTo, initialError, initialMessage }: LoginFormProps) {
  const router = useRouter();
  const [digits, setDigits] = React.useState<string[]>(["", "", "", ""]);
  const [error, setError] = React.useState<string | null>(() => cleanStatusText(initialError));
  const [message, setMessage] = React.useState<string | null>(() =>
    cleanStatusText(initialMessage)
  );
  const [pending, setPending] = React.useState(false);
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);
  const pin = digits.join("");
  const complete = /^\d{4}$/.test(pin);

  function updateDigit(index: number, rawValue: string) {
    const value = normalizePinDigits(rawValue);
    setError(null);
    setMessage(null);
    setDigits((current) => {
      const next = [...current];
      next[index] = value.at(-1) ?? "";
      return next;
    });
    if (value.length > 0 && index < inputs.current.length - 1) {
      inputs.current[index + 1]?.focus();
      inputs.current[index + 1]?.select();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = normalizePinDigits(event.clipboardData.getData("text"));
    if (pasted.length === 0) return;
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDigits(["", "", "", ""].map((_, index) => pasted[index] ?? ""));
    const targetIndex = Math.min(pasted.length, 4) - 1;
    inputs.current[Math.max(targetIndex, 0)]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace" || digits[index]) return;
    if (index > 0) {
      inputs.current[index - 1]?.focus();
      inputs.current[index - 1]?.select();
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || pending) return;

    setPending(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { message?: string } | null;
      setError(
        response?.status === 429 || response?.status === 409 || response?.status === 503
          ? body?.message || "PIN login is not configured."
          : "Invalid PIN"
      );
      setDigits(["", "", "", ""]);
      inputs.current[0]?.focus();
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="login-title"
      className="w-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6"
    >
      <div className="mb-6 space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-muted-foreground">
          HH Group
        </p>
        <h1
          id="login-title"
          className="text-2xl font-semibold tracking-normal text-zinc-950 dark:text-foreground"
        >
          Enter PIN
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-muted-foreground">
          Unlock the internal workspace.
        </p>
      </div>

      {message ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="grid grid-cols-4 gap-3" aria-label="4 digit PIN">
          {digits.map((digit, index) => (
            <div key={index}>
              <label className="sr-only" htmlFor={`pin-${index + 1}`}>
                PIN digit {index + 1}
              </label>
              <input
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                id={`pin-${index + 1}`}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                className="h-14 w-full rounded-lg border border-slate-200 bg-slate-50 text-center text-2xl font-semibold tabular-nums text-slate-950 shadow-inner outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-border dark:bg-muted dark:text-foreground dark:focus:bg-card"
                inputMode="numeric"
                maxLength={1}
                pattern="[0-9]*"
                type="password"
                value={digit}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
                disabled={pending}
              />
            </div>
          ))}
        </div>

        <Button className="h-11 w-full" type="submit" disabled={!complete || pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Unlocking
            </>
          ) : (
            "Unlock"
          )}
        </Button>
      </form>
    </section>
  );
}
