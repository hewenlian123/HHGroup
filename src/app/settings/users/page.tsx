"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AppRole } from "@/lib/permissions";

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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Users"
        subtitle="Owner-only user role assignment and invitation notes."
        actions={
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {message ? (
        <div className="rounded-lg border border-[#EBEBE9] bg-background px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      <Card className="border-[#EBEBE9] p-4 dark:border-border">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground mb-2">
          Invite note (optional)
        </p>
        <Input
          value={inviteNote}
          onChange={(event) => setInviteNote(event.target.value)}
          placeholder="Example: New assistants should only submit timesheets."
        />
      </Card>

      <Card className="overflow-hidden border-[#EBEBE9] p-0 dark:border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    Loading users...
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#EBEBE9]/80 dark:border-border/30">
                  <td className="px-4 py-3 text-foreground">{row.email || row.id}</td>
                  <td className="px-4 py-3">
                    {row.role === "owner" ? (
                      <span className="text-sm font-medium text-foreground">owner</span>
                    ) : (
                      <Select
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
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
