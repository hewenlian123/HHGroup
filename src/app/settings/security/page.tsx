import { PageHeader } from "@/components/page-header";
import { SecurityPinForm } from "./security-pin-form";

export default function SettingsSecurityPage() {
  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Security"
        subtitle="Manage the 4-digit app unlock PIN for ordinary HH Group workspace access."
      />
      <SecurityPinForm />
    </div>
  );
}
