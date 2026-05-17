import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { LoginForm } from "./login-form";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";

type LoginSearchParams = {
  redirect?: string | string[];
  error?: string | string[];
  message?: string | string[];
};

function resolveLoginSearchParams(
  searchParams: LoginSearchParams | Promise<LoginSearchParams> | undefined
): Promise<LoginSearchParams> {
  if (searchParams == null) return Promise.resolve({});
  if (typeof (searchParams as Promise<LoginSearchParams>).then === "function") {
    return searchParams as Promise<LoginSearchParams>;
  }
  return Promise.resolve(searchParams as LoginSearchParams);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: LoginSearchParams | Promise<LoginSearchParams>;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const params = await resolveLoginSearchParams(searchParams);
  const redirectTo = normalizeAuthRedirect(params.redirect);

  if (url && anonKey) {
    // Next.js 14: cookies() is synchronous. (Next.js 15 made it async.)
    const cookieStore = cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(redirectTo);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-950 dark:bg-background dark:text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md items-center justify-center">
        <LoginForm
          anonKey={anonKey ?? null}
          initialMessage={Array.isArray(params.message) ? params.message[0] : params.message}
          initialError={Array.isArray(params.error) ? params.error[0] : params.error}
          redirectTo={redirectTo}
          supabaseUrl={url ?? null}
        />
      </div>
    </div>
  );
}
