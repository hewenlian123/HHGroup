"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

import {
  AUTH_BODY_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_META_CLASS,
  AUTH_PANEL_SHELL_CLASS,
  AUTH_SUCCESS_CLASS,
  AUTH_TITLE_CLASS,
} from "@/components/auth/auth-ui";
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
    <section aria-labelledby="login-title" className={AUTH_PANEL_SHELL_CLASS}>
      <div className="border-b border-[var(--hh-border)] px-hh-6 pb-hh-5 pt-hh-6">
        <div className="mb-hh-5 flex h-hh-touch w-hh-touch items-center justify-center rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-primary)]">
          <LockKeyhole className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className={`${AUTH_LABEL_CLASS} uppercase`}>HH Group</p>
        <h1 id="login-title" className={`mt-hh-2 ${AUTH_TITLE_CLASS}`}>
          Welcome back
        </h1>
        <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>Sign in to your secure operations workspace.</p>
      </div>

      <form className="space-y-hh-4 px-hh-6 py-hh-6" onSubmit={onSubmit}>
        {initialMessage ? (
          <div role="status" className={AUTH_SUCCESS_CLASS}>
            {initialMessage}
          </div>
        ) : null}

        {error ? (
          <div role="alert" aria-live="assertive" className={AUTH_ERROR_CLASS}>
            {error}
          </div>
        ) : null}

        <div className="space-y-hh-1">
          <label className={AUTH_LABEL_CLASS} htmlFor="login-email">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]"
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
              className={`${AUTH_INPUT_CLASS} py-hh-2 pl-10 pr-hh-3`}
              placeholder="owner@hhgroup.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-hh-1">
          <div className="flex items-center justify-between gap-4">
            <label className={AUTH_LABEL_CLASS} htmlFor="login-password">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="hh-focus-ring rounded-hh-compact text-hh-label text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
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
              className={`${AUTH_INPUT_CLASS} pr-12`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="hh-focus-ring absolute right-0 top-1/2 flex h-hh-touch w-hh-touch -translate-y-1/2 items-center justify-center rounded-hh-compact text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]"
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

        <label className="flex min-h-hh-touch cursor-pointer items-center gap-hh-3 rounded-hh-standard text-hh-body text-[var(--hh-text-secondary)] focus-within:ring-2 focus-within:ring-[var(--hh-focus-ring)] focus-within:ring-offset-2">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
            className="h-4 w-4 rounded-hh-compact border border-[var(--hh-border-strong)] accent-[var(--hh-action-primary)]"
            disabled={pending}
          />
          <span>
            Remember this device
            <span className={`block ${AUTH_META_CLASS}`}>
              Uses the normal Supabase session lifetime.
            </span>
          </span>
        </label>

        <Button
          type="submit"
          className="min-h-hh-touch w-full"
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

      <p
        className={`border-t border-[var(--hh-border)] px-hh-6 py-hh-4 text-center ${AUTH_META_CLASS}`}
      >
        Access is limited to pre-authorized HH Group accounts.
      </p>
    </section>
  );
}
