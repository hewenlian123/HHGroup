import { PageHeader, PageLayout } from "@/components/base";
import { SecurityClientBoundary } from "./security-client-boundary";

export default function SettingsSecurityPage() {
  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Security"
          description="Manage account credentials, session-bound Quick Unlock, and active sessions."
        />
      }
    >
      <SecurityClientBoundary />
    </PageLayout>
  );
}
