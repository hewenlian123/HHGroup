import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readRecoverySessionCookie, readRecoverySessionToken } from "@/lib/auth-recovery-session";
import { authorizedAppRole } from "@/lib/auth-role";
import { sessionIdFromAccessToken } from "@/lib/device-unlock-token";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./reset-password-form";

type ResetPasswordPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const TOKEN_LIKE_PARAMS = ["access_token", "code", "refresh_token", "token", "token_hash"];

function hasTokenLikeParam(searchParams: ResetPasswordPageProps["searchParams"]): boolean {
  return TOKEN_LIKE_PARAMS.some((key) => Boolean(searchParams?.[key]));
}

function InvalidRecoveryState() {
  return (
    <section className="w-full max-w-[430px] rounded-2xl border border-white/[0.09] bg-[rgb(28_28_29_/_0.96)] p-6 shadow-[0_28px_80px_rgb(0_0_0_/_0.38)] sm:p-7">
      <h1 className="text-2xl font-semibold text-white">Password reset link unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        This reset link is invalid, expired, or has already been used. Request a new link to
        continue securely.
      </p>
      <Link
        href="/forgot-password"
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--neo-gold)] px-4 text-sm font-semibold text-[#17130d] outline-none transition-colors hover:bg-[#c7a56f] focus-visible:ring-2 focus-visible:ring-[rgb(184_147_90_/_0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1c1d]"
      >
        Request a new reset link
      </Link>
    </section>
  );
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  if (hasTokenLikeParam(searchParams)) {
    redirect("/reset-password?error=invalid_or_expired_link");
  }

  const supabase = await createServerSupabaseClient();
  const userResult = supabase
    ? await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    : { data: { user: null } };
  const sessionResult = supabase
    ? await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
    : { data: { session: null } };
  const user = userResult.data.user;
  const session = sessionResult.data.session;
  const sessionId = session?.access_token ? sessionIdFromAccessToken(session.access_token) : null;
  const recovery = await readRecoverySessionToken(
    readRecoverySessionCookie({ cookies: cookies() })
  );
  const validRecovery = Boolean(
    user &&
    authorizedAppRole(user) &&
    sessionId &&
    recovery &&
    recovery.userId === user.id &&
    recovery.sessionId === sessionId
  );

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#151516] px-4 py-8">
      {validRecovery ? <ResetPasswordForm /> : <InvalidRecoveryState />}
    </main>
  );
}
