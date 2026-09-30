import { PageHeader, PageLayout } from "@/components/base";
import { SecurityClientBoundary } from "./security-client-boundary";

export default function SettingsSecurityPage() {
  return (
    <PageLayout
      frame="embedded"
      divider={false}
      header={
        <PageHeader
          variant="workspace"
          title="Security"
          description="Manage account credentials, session-bound Quick Unlock, and active sessions."
        />
      }
    >
      <SecurityClientBoundary />
    </PageLayout>
  );
}
