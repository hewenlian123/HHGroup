import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { UnlockForm } from "./unlock-form";

type UnlockPageProps = {
  searchParams?: { redirect?: string | string[] };
};

export default function UnlockPage({ searchParams }: UnlockPageProps) {
  const redirectTo = normalizeAuthRedirect(searchParams?.redirect);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#151516] px-4 py-8">
      <UnlockForm redirectTo={redirectTo} />
    </main>
  );
}
