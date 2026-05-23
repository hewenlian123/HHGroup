import { PageHeader, PageLayout } from "@/components/base";
import { SecurityPinForm } from "./security-pin-form";

export default function SettingsSecurityPage() {
  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Security"
          description="Manage the 4-digit app unlock PIN for ordinary HH Group workspace access."
        />
      }
    >
      <SecurityPinForm />
    </PageLayout>
  );
}
