"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoPanel,
  NeoSelect,
  NeoTable,
  PageHeader,
  PageLayout,
  neoFormNoticeClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/permissions";
import { tableRawThClass } from "@/components/ui/table";

type ProfileRow = {
  id: string;
  email: string | null;
  role: AppRole;
  created_at: string;
};

export default function SettingsUsersPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [rows, setRows] = React.useState<ProfileRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [inviteNote, setInviteNote] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setMessage("Supabase is not configured.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,role,created_at")
      .order("created_at", { ascending: true });
    if (error) {
      setMessage(error.message || "Failed to load users.");
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ProfileRow[]);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const setUserRole = async (userId: string, nextRole: AppRole) => {
    if (!supabase) return;
    setSavingId(userId);
    setMessage(null);
    const { error } = await supabase.from("profiles").update({ role: nextRole }).eq("id", userId);
    if (error) {
      setMessage(error.message || "Failed to update role.");
      setSavingId(null);
      return;
    }
    await refresh();
    setSavingId(null);
  };

  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Users"
          description="Owner-only user role assignment and invitation notes."
          actions={
            <Button variant="outline" onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        />
      }
    >
      {message ? <div className={neoFormNoticeClassName}>{message}</div> : null}

      <NeoPanel bodyClassName="p-4">
        <div className="space-y-1.5">
          <NeoFieldLabel htmlFor="settings-users-invite-note">Invite note (optional)</NeoFieldLabel>
          <NeoInput
            id="settings-users-invite-note"
            value={inviteNote}
            onChange={(event) => setInviteNote(event.target.value)}
            placeholder="Example: New assistants should only submit timesheets."
          />
        </div>
      </NeoPanel>

      {loading ? <LoadingState text="Loading users..." /> : null}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No users found" description="No user profiles are available." />
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <NeoMobileCard key={row.id} className="space-y-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
                    {row.email || row.id}
                  </p>
                  <p className="text-xs text-[var(--neo-text-secondary)]">
                    Created {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                {row.role === "owner" ? (
                  <span className="text-sm font-medium text-[var(--neo-text-primary)]">owner</span>
                ) : (
                  <NeoSelect
                    value={row.role}
                    onChange={(event) =>
                      void setUserRole(
                        row.id,
                        event.target.value === "admin" ? "admin" : "assistant"
                      )
                    }
                    disabled={savingId === row.id}
                  >
                    <option value="admin">admin</option>
                    <option value="assistant">assistant</option>
                  </NeoSelect>
                )}
              </NeoMobileCard>
            ))}
          </div>

          <NeoTable className="hidden md:block" tableClassName="min-w-[680px]">
            <thead>
              <tr>
                <th className={tableRawThClass}>Email</th>
                <th className={tableRawThClass}>Role</th>
                <th className={tableRawThClass}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-[var(--neo-text-primary)]">
                    {row.email || row.id}
                  </td>
                  <td className="px-4 py-3">
                    {row.role === "owner" ? (
                      <span className="text-sm font-medium text-[var(--neo-text-primary)]">
                        owner
                      </span>
                    ) : (
                      <NeoSelect
                        value={row.role}
                        onChange={(event) =>
                          void setUserRole(
                            row.id,
                            event.target.value === "admin" ? "admin" : "assistant"
                          )
                        }
                        disabled={savingId === row.id}
                        className="h-9 max-w-[200px]"
                      >
                        <option value="admin">admin</option>
                        <option value="assistant">assistant</option>
                      </NeoSelect>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--neo-text-secondary)]">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        </>
      ) : null}
    </PageLayout>
  );
}
