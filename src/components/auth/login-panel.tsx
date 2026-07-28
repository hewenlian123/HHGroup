"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";

type LoginPanelProps = {
  redirectTo: string;
  initialError?: string | null;
  initialMessage?: string | null;
};

type LoginResponse = {
  ok?: boolean;
  redirectTo?: string;
  message?: string;
};

export function LoginPanel({
  redirectTo,
  initialError = null,
  initialMessage = null,
}: LoginPanelProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberDevice, setRememberDevice] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        redirect: redirectTo,
        rememberDevice,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as LoginResponse | null;
    setPending(false);

    if (!response?.ok || !body?.ok) {
      setError(body?.message || "Unable to sign in with those credentials.");
      return;
    }

    router.replace(body.redirectTo || redirectTo);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="login-title"
      className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] shadow-[0_28px_80px_rgb(0_0_0_/_0.38),inset_0_1px_0_rgb(255_255_255_/_0.04)]"
    >
      <div className="border-b border-white/[0.07] px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[rgb(184_147_90_/_0.28)] bg-[rgb(184_147_90_/_0.12)] text-[var(--neo-gold)]">
          <LockKeyhole className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--neo-gold)]">
          HH Group
        </p>
        <h1
          id="login-title"
          className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-white"
        >
          Welcome back
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Sign in to your secure operations workspace.
        </p>
      </div>

      <form className="space-y-4 px-6 py-6 sm:px-7" onSubmit={onSubmit}>
        {initialMessage ? (
          <div
            role="status"
            className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-100"
          >
            {initialMessage}
          </div>
        ) : null}

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
          <label className="block text-xs font-medium text-zinc-300" htmlFor="login-email">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <input
              id="login-email"
              name="email"
              autoCapitalize="none"
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              required
              className="min-h-11 w-full rounded-lg border border-white/[0.10] bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/[0.16] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)] disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="owner@hhgroup.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <label className="block text-xs font-medium text-zinc-300" htmlFor="login-password">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="rounded-sm text-xs font-medium text-[var(--neo-gold)] outline-none transition hover:text-[var(--neo-gold-soft)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              autoComplete="current-password"
              required
              className="min-h-11 w-full rounded-lg border border-white/[0.10] bg-black/20 px-3 py-2.5 pr-12 text-sm text-white outline-none transition hover:border-white/[0.16] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)] disabled:cursor-not-allowed disabled:opacity-60"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 outline-none transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--neo-gold)]"
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={pending}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg text-sm text-zinc-300 outline-none focus-within:ring-2 focus-within:ring-[rgb(184_147_90_/_0.34)]">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/20 accent-[var(--neo-gold)]"
            disabled={pending}
          />
          <span>
            Remember this device
            <span className="block text-xs leading-5 text-zinc-500">
              Uses the normal Supabase session lifetime.
            </span>
          </span>
        </label>

        <Button
          type="submit"
          className="min-h-11 w-full bg-[var(--neo-gold)] text-zinc-950 hover:bg-[var(--neo-gold-soft)]"
          disabled={pending || !email || !password}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Signing in
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="border-t border-white/[0.07] px-6 py-4 text-center text-xs leading-5 text-zinc-500 sm:px-7">
        Access is limited to pre-authorized HH Group accounts.
      </p>
    </section>
  );
}
