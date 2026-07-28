import { redirect } from "next/navigation";

import { authorizedAppRole } from "@/lib/auth-role";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = supabase
    ? await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    : { data: { user: null } };

  if (!user || !authorizedAppRole(user)) {
    redirect("/login?error=invalid_or_expired_link");
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#151516] px-4 py-8">
      <ResetPasswordForm />
    </main>
  );
}
