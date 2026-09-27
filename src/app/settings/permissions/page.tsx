"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import {
  LoadingState,
  NeoFieldLabel,
  NeoPanel,
  NeoSelect,
  NeoToolbar,
  PageHeader,
  PageLayout,
  neoFormNoticeClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  type AppRole,
  type PermissionKey,
  type PermissionMap,
} from "@/lib/permissions";
import { runOptimisticPersist } from "@/lib/optimistic-save";

type PermissionRow = {
  role: AppRole;
  perms: unknown;
};

function coercePerms(input: unknown, role: AppRole): PermissionMap {
  const out = { ...DEFAULT_ROLE_PERMISSIONS[role] };
  if (!input || typeof input !== "object") return out;
  const rec = input as Record<string, unknown>;
  for (const key of Object.keys(out) as PermissionKey[]) {
    if (typeof rec[key] === "boolean") out[key] = rec[key] as boolean;
  }
  return out;
}

export default function SettingsPermissionsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [targetRole, setTargetRole] = React.useState<AppRole>("admin");
  const [perms, setPerms] = React.useState<PermissionMap>(DEFAULT_ROLE_PERMISSIONS.admin);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const savedPermsRef = React.useRef<PermissionMap>(DEFAULT_ROLE_PERMISSIONS.admin);

  const loadRole = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("role_permissions")
      .select("role,perms")
      .eq("role", targetRole)
      .maybeSingle();
    if (error) {
      setMessage(error.message || "Failed to load role permissions.");
      const def = DEFAULT_ROLE_PERMISSIONS[targetRole];
      setPerms(def);
      savedPermsRef.current = { ...def };
      setLoading(false);
      return;
    }
    const row = (data ?? null) as PermissionRow | null;
    const loaded = coercePerms(row?.perms, targetRole);
    setPerms(loaded);
    savedPermsRef.current = { ...loaded };
    setLoading(false);
  }, [supabase, targetRole]);

  React.useEffect(() => {
    void loadRole();
  }, [loadRole]);

  useOnAppSync(
    React.useCallback(() => {
      void loadRole();
    }, [loadRole]),
    [loadRole]
  );

  const toggle = (key: PermissionKey) => {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const save = () => {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    const permsToSave = { ...perms };
    const lastSaved = { ...savedPermsRef.current };
    const prevMessage = message;

    type Snap = { perms: PermissionMap; message: string | null };
    runOptimisticPersist<Snap>({
      setBusy: setSaving,
      getSnapshot: () => ({ perms: lastSaved, message: prevMessage }),
      apply: () => setMessage("Permissions saved."),
      rollback: (s) => {
        setPerms(s.perms);
        setMessage(s.message);
      },
      persist: async () => {
        const { error } = await supabase
          .from("role_permissions")
          .upsert([{ role: targetRole, perms: permsToSave }], { onConflict: "role" });
        if (error) return { error: error.message || "Failed to save permissions." };
        return undefined;
      },
      onError: (msg) => setMessage(msg),
      onSuccess: () => {
        savedPermsRef.current = { ...permsToSave };
      },
    });
  };

  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Permissions"
          description="Owner-only permission matrix for admin and assistant roles."
          actions={
            <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          }
        />
      }
    >
      {message ? <div className={neoFormNoticeClassName}>{message}</div> : null}

      <NeoToolbar className="flex-col items-stretch sm:items-stretch">
        <div className="w-full max-w-xs space-y-1.5">
          <NeoFieldLabel>Role</NeoFieldLabel>
          <NeoSelect
            value={targetRole}
            onChange={(event) =>
              setTargetRole(event.target.value === "assistant" ? "assistant" : "admin")
            }
          >
            <option value="admin">admin</option>
            <option value="assistant">assistant</option>
          </NeoSelect>
        </div>
      </NeoToolbar>

      {loading ? <LoadingState text="Loading permissions..." /> : null}

      <NeoPanel bodyClassName="p-5">
        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] p-3"
            >
              <p className="mb-2 text-sm font-semibold text-[var(--hh-text-primary)]">
                {group.title}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {group.keys.map((key) => (
                  <label
                    key={key}
                    className="inline-flex min-h-10 items-center gap-2 rounded-hh-compact px-2 text-sm text-[var(--hh-text-primary)] hover:bg-[var(--hh-l2-operational-surface)]"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(perms[key])}
                      onChange={() => toggle(key)}
                    />
                    <span>{key}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
