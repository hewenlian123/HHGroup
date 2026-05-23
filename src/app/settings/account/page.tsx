"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase";
import { NeoPanel, NeoStatus, PageHeader, PageLayout } from "@/components/base";

type RoleLabel = "Owner" | "Admin" | "Assistant";

function roleLabel(role: string | null | undefined): RoleLabel {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Assistant";
}

export default function SettingsAccountPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [email, setEmail] = React.useState<string>("");

  React.useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    };
    void load();
  }, [supabase]);

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
      <NeoPanel className="max-w-2xl" bodyClassName="divide-y divide-[var(--neo-border)]">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-[var(--neo-text-secondary)]">Email</p>
          <p className="min-w-0 truncate text-sm font-medium text-[var(--neo-text-primary)]">
            {email || "—"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-[var(--neo-text-secondary)]">Role</p>
          <NeoStatus label={roleLabel(null)} variant="default" />
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
