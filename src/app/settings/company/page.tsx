"use client";

import * as React from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase";
import {
  ensureCompanyProfile,
  removeCompanyLogo,
  saveCompanyProfile,
  type CompanyProfile,
  uploadCompanyLogo,
} from "@/lib/company-profile";

type FormState = {
  org_name: string;
  legal_name: string;
  phone: string;
  email: string;
  website: string;
  license_number: string;
  tax_id: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  invoice_footer: string;
  default_terms: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  org_name: "HH Group",
  legal_name: "",
  phone: "",
  email: "",
  website: "",
  license_number: "",
  tax_id: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  invoice_footer: "",
  default_terms: "",
  notes: "",
};

function toFormState(profile: CompanyProfile): FormState {
  return {
    org_name: profile.org_name ?? "HH Group",
    legal_name: profile.legal_name ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    website: profile.website ?? "",
    license_number: profile.license_number ?? "",
    tax_id: profile.tax_id ?? "",
    address1: profile.address1 ?? "",
    address2: profile.address2 ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    zip: profile.zip ?? "",
    country: profile.country ?? "US",
    invoice_footer: profile.invoice_footer ?? "",
    default_terms: profile.default_terms ?? "",
    notes: profile.notes ?? "",
  };
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function SettingsCompanyPage() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);

  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [anon, configured, url]
  );

  const [profile, setProfile] = React.useState<CompanyProfile | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadProfile = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await ensureCompanyProfile(supabase);
      setProfile(row);
      setForm(toFormState(row));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to load company profile.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    if (!supabase || !configured) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await saveCompanyProfile(supabase, {
        org_name: form.org_name.trim() || "HH Group",
        legal_name: toNullable(form.legal_name),
        phone: toNullable(form.phone),
        email: toNullable(form.email),
        website: toNullable(form.website),
        license_number: toNullable(form.license_number),
        tax_id: toNullable(form.tax_id),
        address1: toNullable(form.address1),
        address2: toNullable(form.address2),
        city: toNullable(form.city),
        state: toNullable(form.state),
        zip: toNullable(form.zip),
        country: toNullable(form.country) ?? "US",
        invoice_footer: toNullable(form.invoice_footer),
        default_terms: toNullable(form.default_terms),
        notes: toNullable(form.notes),
      });
      setProfile(updated);
      setForm(toFormState(updated));
      setMessage("Company profile saved.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const processFile = async (file: File | null | undefined) => {
    if (!file || !supabase) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await uploadCompanyLogo(supabase, file);
      setProfile(result.profile);
      setMessage("Logo uploaded.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Logo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    await processFile(file);
  };

  const onRemoveLogo = async () => {
    if (!supabase || !profile?.logo_path) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await removeCompanyLogo(supabase);
      setProfile(updated);
      setMessage("Logo removed.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to remove logo.");
    } finally {
      setUploading(false);
    }
  };

  const disabled = !configured || !supabase || loading || saving || uploading;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Company"
        subtitle="Manage branding and profile details used across the app and generated documents."
      />

      {!configured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Supabase is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable save and upload.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>
      ) : null}

      <Card className="rounded-2xl border border-zinc-200/60 p-5 dark:border-border">
        <SectionHeader title="Branding" subtitle="Upload logo for sidebar, topbar, and future PDF output." />
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <label
            htmlFor="logo-upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex min-h-28 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-muted-foreground hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/50"
          >
            {profile?.logo_url ? (
              <Image
                src={profile.logo_url}
                alt="Company logo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-md object-contain bg-white p-1"
                unoptimized
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-200/70 dark:bg-zinc-800">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
            <div className="space-y-1">
              <p className="font-medium text-foreground">Drag & drop logo or click to upload</p>
              <p className="text-xs">PNG/JPG/SVG up to 5MB. Stored in `branding/company/logo.*`.</p>
            </div>
            <input
              ref={fileRef}
              id="logo-upload"
              type="file"
              className="hidden"
              accept="image/*"
              disabled={disabled}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                await processFile(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={onRemoveLogo}
            disabled={disabled || !profile?.logo_path}
            className="h-10 gap-2 self-start"
          >
            <Trash2 className="h-4 w-4" />
            Remove Logo
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 p-5 dark:border-border">
        <SectionHeader title="Company Profile" subtitle="This profile is shared globally across HH Unified." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input placeholder="Company Name" value={form.org_name} onChange={(e) => updateField("org_name", e.target.value)} />
          <Input placeholder="Legal Name" value={form.legal_name} onChange={(e) => updateField("legal_name", e.target.value)} />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          <Input placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          <Input placeholder="Website" value={form.website} onChange={(e) => updateField("website", e.target.value)} />
          <Input
            placeholder="License Number"
            value={form.license_number}
            onChange={(e) => updateField("license_number", e.target.value)}
          />
          <Input placeholder="Tax ID" value={form.tax_id} onChange={(e) => updateField("tax_id", e.target.value)} />
          <Input placeholder="Address Line 1" value={form.address1} onChange={(e) => updateField("address1", e.target.value)} />
          <Input placeholder="Address Line 2" value={form.address2} onChange={(e) => updateField("address2", e.target.value)} />
          <Input placeholder="City" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
          <Input placeholder="State" value={form.state} onChange={(e) => updateField("state", e.target.value)} />
          <Input placeholder="ZIP" value={form.zip} onChange={(e) => updateField("zip", e.target.value)} />
          <Input placeholder="Country" value={form.country} onChange={(e) => updateField("country", e.target.value)} />
        </div>
        <div className="mt-3 grid gap-3">
          <textarea
            value={form.default_terms}
            onChange={(e) => updateField("default_terms", e.target.value)}
            placeholder="Default Terms"
            className="min-h-20 rounded-[10px] border border-input bg-muted/20 px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          <textarea
            value={form.invoice_footer}
            onChange={(e) => updateField("invoice_footer", e.target.value)}
            placeholder="Invoice Footer"
            className="min-h-20 rounded-[10px] border border-input bg-muted/20 px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Notes"
            className="min-h-24 rounded-[10px] border border-input bg-muted/20 px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" disabled={disabled} onClick={onSave} className="gap-2">
            <Upload className="h-4 w-4" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

