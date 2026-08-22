import { AUTH_PAGE_CLASS } from "@/components/auth/auth-ui";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { UnlockForm } from "./unlock-form";

type UnlockPageProps = {
  searchParams?: { redirect?: string | string[] };
};

export default function UnlockPage({ searchParams }: UnlockPageProps) {
  const redirectTo = normalizeAuthRedirect(searchParams?.redirect);
  return (
    <main className={AUTH_PAGE_CLASS}>
      <UnlockForm redirectTo={redirectTo} />
    </main>
  );
}
