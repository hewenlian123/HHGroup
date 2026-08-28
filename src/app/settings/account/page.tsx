"use client";

import { NeoPanel, NeoStatus, PageHeader, PageLayout } from "@/components/base";
import { useAuth } from "@/components/auth/auth-provider";
import { authIdentityRoleLabel } from "@/components/auth/auth-ui";

export default function SettingsAccountPage() {
  const { role, user } = useAuth();

  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Account"
          description="View your current signed-in account and access role."
        />
      }
    >
      <NeoPanel className="max-w-2xl" bodyClassName="divide-y divide-[var(--hh-border)]">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-[var(--hh-text-secondary)]">Email</p>
          <p className="min-w-0 truncate text-sm font-medium text-[var(--hh-text-primary)]">
            {user?.email || "—"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-[var(--hh-text-secondary)]">Role</p>
          <NeoStatus label={authIdentityRoleLabel(role, Boolean(user))} variant="default" />
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
