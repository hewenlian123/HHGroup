import { ForgotPasswordForm } from "./forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const mode = searchParams?.mode === "verify" ? "verify" : "request";

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#151516] px-4 py-8">
      <ForgotPasswordForm mode={mode} />
    </main>
  );
}
