import { redirect } from "next/navigation";

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
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#151516] px-4 py-8 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 18% 12%, rgb(184 147 90 / 0.11), transparent 34%), radial-gradient(circle at 84% 86%, rgb(255 255 255 / 0.035), transparent 32%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />
      <div className="relative z-10 w-full max-w-[430px]">
        <LoginPanel
          redirectTo={redirectTo}
          initialError={initialError}
          initialMessage={initialMessage}
        />
        <p className="mt-5 text-center text-[11px] text-zinc-600">
          Secure access · HH Neo Operations OS
        </p>
      </div>
    </div>
  );
}
