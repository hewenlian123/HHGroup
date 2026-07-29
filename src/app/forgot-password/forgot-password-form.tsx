"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";

type ForgotPasswordFormProps = {
  mode?: "request" | "verify";
};

export function ForgotPasswordForm({ mode = "request" }: ForgotPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      message?: string;
    } | null;
    setPending(false);

    if (!response?.ok) {
      setError("Unable to start password recovery. Try again later.");
      return;
    }
    setMessage(
      body?.message ||
        "If that email belongs to an authorized account, a password reset link has been sent."
    );
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/recovery/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      message?: string;
      redirectTo?: string;
    } | null;
    setPending(false);

    if (!response?.ok || body?.redirectTo !== "/reset-password") {
      setError(body?.message || "Recovery code is invalid or has expired.");
      return;
    }
    router.replace("/reset-password");
  }

  if (mode === "verify") {
    return (
      <section className="w-full max-w-[430px] rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] p-6 shadow-[0_28px_80px_rgb(0_0_0_/_0.38)] sm:p-7">
        <KeyRound className="h-6 w-6 text-[var(--neo-gold)]" strokeWidth={1.8} aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold text-white">Verify your recovery code</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Enter your authorized account email and the one-time code from the newest HH Group email.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onVerify}>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="recovery-email" className="block text-xs font-medium text-zinc-300">
              Email
            </label>
            <input
              id="recovery-email"
              autoComplete="username"
              inputMode="email"
              required
              type="email"
              className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="recovery-code" className="block text-xs font-medium text-zinc-300">
              Recovery code
            </label>
            <input
              id="recovery-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              pattern="[0-9]{6,8}"
              required
              type="text"
              className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-center font-mono text-lg tracking-[0.18em] text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
              disabled={pending}
            />
          </div>
          <Button
            className="min-h-11 w-full"
            type="submit"
            disabled={pending || !email || !/^\d{6,8}$/.test(token)}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? "Verifying" : "Verify recovery code"}
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center rounded-md text-sm text-[var(--neo-gold)] outline-none hover:text-[#d5b47f] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
          >
            Request another code
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-zinc-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[430px] rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] p-6 shadow-[0_28px_80px_rgb(0_0_0_/_0.38)] sm:p-7">
      <Mail className="h-6 w-6 text-[var(--neo-gold)]" strokeWidth={1.8} aria-hidden="true" />
      <h1 className="mt-5 text-2xl font-semibold text-white">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Enter the email for your pre-authorized HH Group account.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {message ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-100"
          >
            {message}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-100"
          >
            {error}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="recovery-email" className="block text-xs font-medium text-zinc-300">
            Email
          </label>
          <input
            id="recovery-email"
            autoComplete="username"
            inputMode="email"
            required
            type="email"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
          />
        </div>
        <Button className="min-h-11 w-full" type="submit" disabled={pending || !email}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Sending" : "Send reset link"}
        </Button>
      </form>
      <Link
        href="/login"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-zinc-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </section>
  );
}
