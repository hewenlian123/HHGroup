"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

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
    <section className="w-full max-w-[430px] rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] p-6 shadow-[0_28px_80px_rgb(0_0_0_/_0.38)] sm:p-7">
      <h1 className="text-2xl font-semibold text-white">Choose a new password</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Use 12–128 characters with uppercase, lowercase, a number, and a symbol.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-100"
          >
            {error}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="reset-password" className="block text-xs font-medium text-zinc-300">
            New password
          </label>
          <input
            id="reset-password"
            autoComplete="new-password"
            required
            type="password"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="reset-password-confirm"
            className="block text-xs font-medium text-zinc-300"
          >
            Confirm new password
          </label>
          <input
            id="reset-password-confirm"
            autoComplete="new-password"
            required
            type="password"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.22)]"
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
