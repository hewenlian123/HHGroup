"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccounts, type Account, type AccountType } from "@/lib/data";
import { createAccountAction, deleteAccountAction, getAccountsAction, updateAccountAction } from "./actions";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import { EmptyState } from "@/components/empty-state";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { DeleteRowAction } from "@/components/base";

const ACCOUNT_TYPES: AccountType[] = ["Credit Card", "Debit Card", "Bank", "Cash", "Other"];

export default function AccountsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <AccountsPageInner />
    </React.Suspense>
  );
}

function AccountsPageInner() {
  const router = useRouter();
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("Credit Card");
  const [lastFour, setLastFour] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await getAccountsAction();
    if (res.error) {
      // Keep the page functional even if auth is missing.
      setAccounts([]);
      return;
    }
    setAccounts(
      res.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type as AccountType,
        lastFour: a.lastFour,
        notes: a.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openModal = () => {
    setName("");
    setType("Credit Card");
    setLastFour("");
    setNotes("");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setName(acc.name ?? "");
    setType((acc.type as AccountType) ?? "Other");
    setLastFour(acc.lastFour ?? "");
    setNotes(acc.notes ?? "");
    setEditingId(acc.id);
    setModalOpen(true);
    // focus on next tick
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleDelete = async (acc: Account) => {
    const prev = accounts;
    setAccounts((p) => p.filter((a) => a.id !== acc.id));
    const res = await deleteAccountAction(acc.id);
    if (!res.ok) {
      setAccounts(prev);
      toast({ title: "Failed to delete account", description: res.error, variant: "error" });
      return;
    }
    void load();
    void syncRouterAndClients(router);
    toast({ title: "Account deleted", variant: "success" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // Defensive: avoid "DOM shows value but state is empty" edge cases.
    const trimmedName = (nameInputRef.current?.value ?? name).trim();
    if (!trimmedName) {
      toast({ title: "Account name required", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await updateAccountAction({
          id: editingId,
          name: trimmedName,
          type,
          lastFour: lastFour.trim() || null,
          notes: notes.trim() || null,
        });
        if (!res.ok) {
          toast({ title: "Failed to update account", description: res.error, variant: "error" });
          return;
        }
        setModalOpen(false);
        setEditingId(null);
        await load();
        void syncRouterAndClients(router);
        toast({ title: "Account updated", variant: "success" });
      } else {
        const result = await createAccountAction({
          name: trimmedName,
          type,
          lastFour: lastFour.trim() || null,
          notes: notes.trim() || null,
        });
        if (result.error) {
          toast({
            title: "Failed to create account",
            description: result.error,
            variant: "error",
          });
          return;
        }
        // Close immediately on success even if refresh/load fails.
        setModalOpen(false);
        // Optimistic insert so the user sees it instantly.
        if (result.data?.id) {
          setAccounts((prev) => {
            const exists = prev.some((a) => a.id === result.data!.id);
            if (exists) return prev;
            const now = new Date().toISOString();
            return [
              {
                id: result.data!.id,
                name: trimmedName,
                type,
                lastFour: lastFour.trim() || null,
                notes: notes.trim() || null,
                createdAt: now,
                updatedAt: now,
              },
              ...prev,
            ];
          });
        }
        // Refresh from server so the list reflects canonical data.
        await load();
        void syncRouterAndClients(router);
        toast({ title: "Account created", variant: "success" });
      }
    } catch (err) {
      toast({
        title: editingId ? "Failed to save account" : "Failed to create account",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Accounts"
        description="Manage payment sources: credit cards, debit cards, bank accounts, cash."
        actions={
          <Button size="sm" className="h-8" onClick={openModal}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add a payment source to use when creating expenses."
          icon={null}
          action={
            <Button size="sm" className="h-8" onClick={openModal}>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          }
        />
      ) : (
        <section className="border-b border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Account Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">Last 4</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((row) => (
                  <TableRow key={row.id} className="group border-b border-border/30 hover:bg-muted/20">
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.type}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.lastFour ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DeleteRowAction
                          onDelete={async () => {
                            await handleDelete(row);
                          }}
                        />
                        <RowActionsMenu
                          ariaLabel={`Actions for ${row.name}`}
                          actions={[{ label: "Edit", onClick: () => openEdit(row) }]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md border-border/60">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="text-base font-medium">{editingId ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chase Ink, BoA Bank"
                className="h-9"
                required
                ref={nameInputRef}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last 4 digits (optional)</label>
              <Input
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                className="h-9 w-24 tabular-nums"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setModalOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-8" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Save account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
