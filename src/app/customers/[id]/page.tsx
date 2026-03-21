"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CustomerRow = {
  id: string;
  name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
};

type CustomerForm = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: "active" | "inactive";
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [form, setForm] = React.useState<CustomerForm>({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    status: "active",
  });

  const refresh = React.useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    setNotFound(false);
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) {
      setMessage(error.message || "Failed to load customer.");
      setLoading(false);
      return;
    }
    if (!data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const row = data as CustomerRow;
    setForm({
      name: row.name ?? "",
      contact_person: row.contact_person ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      status: row.status === "inactive" ? "inactive" : "active",
    });
    setLoading(false);
  }, [id, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const handleSave = React.useCallback(async () => {
    if (!id || !supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const payload = {
      name: toNullable(form.name),
      contact_person: toNullable(form.contact_person),
      phone: toNullable(form.phone),
      email: toNullable(form.email),
      address: toNullable(form.address),
      notes: toNullable(form.notes),
      status: form.status,
    };
    const { error } = await supabase.from("customers").update(payload).eq("id", id);
    if (error) {
      setMessage(error.message || "Failed to save customer.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setMessage("Customer saved.");
    void refresh();
  }, [form, id, refresh, supabase]);

  if (loading) {
    return <div className="page-container page-stack py-6 text-sm text-muted-foreground">Loading customer...</div>;
  }

  if (notFound) {
    return (
      <div className="page-container page-stack py-6">
        <PageHeader title="Customer not found" subtitle="The selected customer does not exist." />
        <Button asChild variant="outline" className="w-fit">
          <Link href="/customers">Back to Customers</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title={form.name?.trim() || "Customer"}
        subtitle="View and edit customer profile."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/customers")}>
              Back
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border border-zinc-200/60 p-4 dark:border-border">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Customer Name</p>
            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Contact Person</p>
            <Input
              value={form.contact_person}
              onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Phone</p>
            <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Email</p>
            <Input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <p className="text-xs text-muted-foreground">Address</p>
            <Input value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <p className="text-xs text-muted-foreground">Notes</p>
            <Input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <select
              className="h-10 w-full rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value === "inactive" ? "inactive" : "active" }))}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}
