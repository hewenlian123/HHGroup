import { redirect } from "next/navigation";

import { AUTH_META_CLASS, AUTH_PAGE_CLASS } from "@/components/auth/auth-ui";
import { LoginPanel } from "@/components/auth/login-panel";
import { authorizedAppRole } from "@/lib/auth-role";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type LoginPageProps = {
  searchParams?: {
    redirect?: string | string[];
    error?: string | string[];
    message?: string | string[];
  };
};

const SAFE_MESSAGES: Record<string, string> = {
  password_reset: "Password updated. Sign in with your new password.",
  signed_out: "You have been signed out.",
  session_expired: "Your session expired. Sign in again.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = normalizeAuthRedirect(searchParams?.redirect);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = supabase
    ? await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    : { data: { user: null } };

  if (user && authorizedAppRole(user)) {
    redirect(redirectTo);
  }

  const errorCode = first(searchParams?.error);
  const messageCode = first(searchParams?.message);
  const initialError =
    errorCode === "invalid_or_expired_link"
      ? "That link is invalid or has expired. Request a new password reset."
      : null;
  const initialMessage = messageCode ? (SAFE_MESSAGES[messageCode] ?? null) : null;

  return (
    <main className={AUTH_PAGE_CLASS}>
      <div className="w-full max-w-[430px]">
        <LoginPanel
          redirectTo={redirectTo}
          initialError={initialError}
          initialMessage={initialMessage}
        />
        <p className={`mt-hh-5 text-center ${AUTH_META_CLASS}`}>
          Secure access · HH Group Operations
        </p>
      </div>
    </main>
  );
}
