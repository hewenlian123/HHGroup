"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  supabaseUrl: string | null;
  anonKey: string | null;
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

export function LoginForm({
  supabaseUrl,
  anonKey,
  redirectTo,
  initialError,
  initialMessage,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(() => cleanStatusText(initialError));
  const [message, setMessage] = React.useState<string | null>(() =>
    cleanStatusText(initialMessage)
  );
  const [pending, setPending] = React.useState(false);
  const configured = Boolean(supabaseUrl && anonKey);

  const supabase = React.useMemo(() => {
    if (!supabaseUrl || !anonKey) return null;
    return createBrowserClient(supabaseUrl, anonKey);
  }, [anonKey, supabaseUrl]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!supabase || !trimmedEmail || !password) return;

    setPending(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setPending(false);

    if (signInError) {
      setError(signInError.message || "Could not sign in. Check your email and password.");
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="login-title"
      className="w-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6"
    >
      <div className="mb-5 space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-muted-foreground">
          HH Group
        </p>
        <h1
          id="login-title"
          className="text-xl font-semibold tracking-normal text-zinc-950 dark:text-foreground"
        >
          Sign in
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-muted-foreground">
          Use your internal admin account to continue.
        </p>
      </div>

      {!configured ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          Supabase Auth is not configured for this deployment.
        </div>
      ) : null}

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

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@hhgroup.com"
            required
            disabled={!configured || pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={!configured || pending}
          />
        </div>

        <Button className="w-full" type="submit" disabled={!configured || pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Signing in
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </section>
  );
}
