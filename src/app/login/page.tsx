import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";

type LoginSearchParams = { redirect?: string };

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
      redirect(params.redirect ?? "/dashboard");
    }
  }

  const redirectTo = params.redirect ?? "/dashboard";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-xl font-semibold text-foreground mb-4">Sign in</h1>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
        Click below to continue to the dashboard.
      </p>
      <Link
        href={redirectTo}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Continue to Dashboard
      </Link>
    </div>
  );
}
