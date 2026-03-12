"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Account"
        subtitle="View your current signed-in account and access role."
      />
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Email</p>
          <p className="text-sm font-medium text-foreground">{email || "—"}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Role</p>
          <StatusBadge status={roleLabel(null)} />
        </div>
      </Card>
    </div>
  );
}
