"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Image from "next/image";
import { Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
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
  default_tax_pct: string;
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
  default_tax_pct: "0",
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
    default_tax_pct: String(profile.default_tax_pct ?? 0),
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
  const router = useRouter();
  const { toast } = useToast();
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

  const loadProfile = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const row = await ensureCompanyProfile(supabase);
      setProfile(row);
      setForm(toFormState(row));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Load failed", description: msg || "Failed to load company profile.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useOnAppSync(
    React.useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
    [loadProfile]
  );

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    if (!supabase || !configured) return;
    setSaving(true);
    try {
      const n = Number(form.default_tax_pct);
      const defaultTaxPct = Number.isFinite(n) ? Math.max(0, n) : 0;
      const updated = await saveCompanyProfile(supabase, {
        org_name: form.org_name.trim() || "HH Group",
        legal_name: toNullable(form.legal_name),
        phone: toNullable(form.phone),
        email: toNullable(form.email),
        website: toNullable(form.website),
        license_number: toNullable(form.license_number),
        tax_id: toNullable(form.tax_id),
        default_tax_pct: defaultTaxPct,
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
      toast({ title: "Saved", variant: "success" });
      void syncRouterAndClients(router);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Save failed", description: msg || "Failed to save profile.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const processFile = async (file: File | null | undefined) => {
    if (!file || !supabase) return;
    setUploading(true);
    try {
      const result = await uploadCompanyLogo(supabase, file);
      setProfile(result.profile);
      toast({ title: "Logo uploaded", variant: "success" });
      void syncRouterAndClients(router);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Upload failed", description: msg || "Logo upload failed.", variant: "error" });
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
    try {
      const updated = await removeCompanyLogo(supabase);
      setProfile(updated);
      toast({ title: "Logo removed", variant: "success" });
      void syncRouterAndClients(router);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Remove failed", description: msg || "Failed to remove logo.", variant: "error" });
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

      <section className="border-b border-[#EBEBE9] pb-8 dark:border-border">
        <SectionHeader title="Branding" subtitle="Upload logo for sidebar, topbar, and future PDF output." />
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <label
            htmlFor="logo-upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex min-h-28 cursor-pointer items-center gap-3 rounded-sm border border-dashed border-[#EBEBE9] bg-background px-4 py-3 text-sm text-muted-foreground hover:bg-[#F7F7F5]/80 dark:border-border dark:hover:bg-muted/20"
          >
            {profile?.logo_url ? (
              <Image
                src={profile.logo_url}
                alt="Company logo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-sm object-contain bg-white p-1"
                unoptimized
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[#F7F7F5] dark:bg-muted/40">
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
              capture="environment"
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
            size="sm"
            onClick={onRemoveLogo}
            disabled={disabled || !profile?.logo_path}
            className="gap-2 self-start rounded-sm"
          >
            <Trash2 className="h-4 w-4" />
            Remove Logo
          </Button>
        </div>
      </section>

      <section className="pt-2">
        <SectionHeader title="Company Profile" subtitle="This profile is shared globally across HH Unified." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input className="rounded-sm" placeholder="Company Name" value={form.org_name} onChange={(e) => updateField("org_name", e.target.value)} />
          <Input className="rounded-sm" placeholder="Legal Name" value={form.legal_name} onChange={(e) => updateField("legal_name", e.target.value)} />
          <Input className="rounded-sm" placeholder="Phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
          <Input className="rounded-sm" placeholder="Email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
          <Input className="rounded-sm" placeholder="Website" value={form.website} onChange={(e) => updateField("website", e.target.value)} />
          <Input
            className="rounded-sm"
            placeholder="License Number"
            value={form.license_number}
            onChange={(e) => updateField("license_number", e.target.value)}
          />
          <Input className="rounded-sm" placeholder="Tax ID" value={form.tax_id} onChange={(e) => updateField("tax_id", e.target.value)} />
          <Input
            className="rounded-sm"
            placeholder="Default tax %"
            inputMode="decimal"
            value={form.default_tax_pct}
            onChange={(e) => updateField("default_tax_pct", e.target.value)}
          />
          <Input className="rounded-sm" placeholder="Address Line 1" value={form.address1} onChange={(e) => updateField("address1", e.target.value)} />
          <Input className="rounded-sm" placeholder="Address Line 2" value={form.address2} onChange={(e) => updateField("address2", e.target.value)} />
          <Input className="rounded-sm" placeholder="City" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
          <Input className="rounded-sm" placeholder="State" value={form.state} onChange={(e) => updateField("state", e.target.value)} />
          <Input className="rounded-sm" placeholder="ZIP" value={form.zip} onChange={(e) => updateField("zip", e.target.value)} />
          <Input className="rounded-sm" placeholder="Country" value={form.country} onChange={(e) => updateField("country", e.target.value)} />
        </div>
        <div className="mt-3 grid gap-3">
          <textarea
            value={form.default_terms}
            onChange={(e) => updateField("default_terms", e.target.value)}
            placeholder="Default Terms"
            className="min-h-20 rounded-sm border border-[#EBEBE9] bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring dark:border-border"
          />
          <textarea
            value={form.invoice_footer}
            onChange={(e) => updateField("invoice_footer", e.target.value)}
            placeholder="Invoice Footer"
            className="min-h-20 rounded-sm border border-[#EBEBE9] bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring dark:border-border"
          />
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Notes"
            className="min-h-24 rounded-sm border border-[#EBEBE9] bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring dark:border-border"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" disabled={disabled} onClick={onSave} className="gap-2 rounded-sm">
            <Upload className="h-4 w-4" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </section>
    </div>
  );
}

