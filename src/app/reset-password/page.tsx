import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_BODY_CLASS,
  AUTH_LINK_CLASS,
  AUTH_PAGE_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_TITLE_CLASS,
} from "@/components/auth/auth-ui";
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
    <section className={AUTH_PANEL_CLASS}>
      <h1 className={AUTH_TITLE_CLASS}>Password reset link unavailable</h1>
      <p className={`mt-hh-2 ${AUTH_BODY_CLASS}`}>
        This reset link is invalid, expired, or has already been used. Request a new link to
        continue securely.
      </p>
      <Link
        href="/forgot-password"
        className={`${AUTH_LINK_CLASS} mt-hh-6 w-full justify-center bg-[var(--hh-action-primary)] px-hh-4 text-[var(--hh-action-primary-foreground)] hover:text-[var(--hh-action-primary-foreground)] hover:opacity-90`}
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
    <main className={AUTH_PAGE_CLASS}>
      {validRecovery ? <ResetPasswordForm /> : <InvalidRecoveryState />}
    </main>
  );
}
