"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";

import {
  AUTH_BODY_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_SUCCESS_CLASS,
  AUTH_TITLE_CLASS,
} from "@/components/auth/auth-ui";
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
      <section className={AUTH_PANEL_CLASS}>
        <KeyRound
          className="h-6 w-6 text-[var(--hh-text-primary)]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <h1 className={`mt-hh-5 ${AUTH_TITLE_CLASS}`}>Verify your recovery code</h1>
        <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>
          Enter your authorized account email and the one-time code from the newest HH Group email.
        </p>

        <form className="mt-hh-6 space-y-hh-4" onSubmit={onVerify}>
          {error ? (
            <div role="alert" className={AUTH_ERROR_CLASS}>
              {error}
            </div>
          ) : null}
          <div className="space-y-hh-1">
            <label htmlFor="recovery-email" className={AUTH_LABEL_CLASS}>
              Email
            </label>
            <input
              id="recovery-email"
              autoComplete="username"
              inputMode="email"
              required
              type="email"
              className={AUTH_INPUT_CLASS}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-hh-1">
            <label htmlFor="recovery-code" className={AUTH_LABEL_CLASS}>
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
              className={`${AUTH_INPUT_CLASS} hh-fin text-center text-hh-financial-total tracking-normal`}
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
        <div className="mt-hh-5 flex flex-wrap items-center justify-between gap-hh-3">
          <Link href="/forgot-password" className={AUTH_LINK_CLASS}>
            Request another code
          </Link>
          <Link href="/login" className={`${AUTH_LINK_CLASS} gap-hh-2`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={AUTH_PANEL_CLASS}>
      <Mail
        className="h-6 w-6 text-[var(--hh-text-primary)]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <h1 className={`mt-hh-5 ${AUTH_TITLE_CLASS}`}>Reset your password</h1>
      <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>
        Enter the email for your pre-authorized HH Group account.
      </p>

      <form className="mt-hh-6 space-y-hh-4" onSubmit={onSubmit}>
        {message ? (
          <div role="status" className={AUTH_SUCCESS_CLASS}>
            {message}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </div>
        ) : null}
        <div className="space-y-hh-1">
          <label htmlFor="recovery-email" className={AUTH_LABEL_CLASS}>
            Email
          </label>
          <input
            id="recovery-email"
            autoComplete="username"
            inputMode="email"
            required
            type="email"
            className={AUTH_INPUT_CLASS}
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
      <Link href="/login" className={`${AUTH_LINK_CLASS} mt-hh-5 gap-hh-2`}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to sign in
      </Link>
    </section>
  );
}
