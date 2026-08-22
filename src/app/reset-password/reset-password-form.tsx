"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import {
  AUTH_BODY_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_TITLE_CLASS,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (password !== confirmation) {
      setError("Password confirmation does not match.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPassword: password,
        confirmPassword: confirmation,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      message?: string;
      redirectTo?: string;
    } | null;
    setPending(false);
    if (!response?.ok) {
      setError(body?.message || "Unable to reset password.");
      return;
    }
    router.replace(body?.redirectTo || "/login?message=password_reset");
    router.refresh();
  }

  return (
    <section className={AUTH_PANEL_CLASS}>
      <h1 className={AUTH_TITLE_CLASS}>Choose a new password</h1>
      <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>
        Use 12–128 characters with uppercase, lowercase, a number, and a symbol.
      </p>
      <form className="mt-hh-6 space-y-hh-4" onSubmit={onSubmit}>
        {error ? (
          <div role="alert" className={AUTH_ERROR_CLASS}>
            {error}
          </div>
        ) : null}
        <div className="space-y-hh-1">
          <label htmlFor="reset-password" className={AUTH_LABEL_CLASS}>
            New password
          </label>
          <input
            id="reset-password"
            autoComplete="new-password"
            required
            type="password"
            className={AUTH_INPUT_CLASS}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-hh-1">
          <label htmlFor="reset-password-confirm" className={AUTH_LABEL_CLASS}>
            Confirm new password
          </label>
          <input
            id="reset-password-confirm"
            autoComplete="new-password"
            required
            type="password"
            className={AUTH_INPUT_CLASS}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending}
          />
        </div>
        <Button className="min-h-11 w-full" type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? "Updating" : "Update password"}
        </Button>
      </form>
    </section>
  );
}
