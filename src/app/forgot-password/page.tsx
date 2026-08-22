import { AUTH_PAGE_CLASS } from "@/components/auth/auth-ui";
import { ForgotPasswordForm } from "./forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const mode = searchParams?.mode === "verify" ? "verify" : "request";

  return (
    <main className={AUTH_PAGE_CLASS}>
      <ForgotPasswordForm mode={mode} />
    </main>
  );
}
