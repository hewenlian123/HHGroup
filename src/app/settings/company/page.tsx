"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchClientDataSync } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { flushSync } from "react-dom";
import { Upload, Image as ImageIcon, Trash2 } from "lucide-react";
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
import { runOptimisticPersist } from "@/lib/optimistic-save";
import {
  validateCompanyProfileEmailField,
  validateLogoFileForUpload,
} from "@/lib/company-profile-form-validation";

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

/** Server logo route may not see SSR cookies; pass access_token when the browser has a session. */
async function authHeadersForLogoApi(client: SupabaseClient): Promise<HeadersInit> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

function mergeFormIntoProfile(form: FormState, prev: CompanyProfile): CompanyProfile {
  const n = Number(form.default_tax_pct);
  const defaultTaxPct = Number.isFinite(n) ? Math.max(0, n) : 0;
  return {
    ...prev,
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
  };
}

export default function SettingsCompanyPage() {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  /**
   * After save/logo mutations we already hold the canonical row from the response.
   * `dispatchClientDataSync` would immediately refetch; a race or RLS gap can make `getCompanyProfile`
   * look empty and `ensureCompanyProfile` insert a default "HH Group" row — skip one reload.
   */
  const suppressNextCompanyProfileSyncReloadRef = React.useRef(false);
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
  /** next/image rejects unconfigured remote hosts; use <img> and recover from broken URLs. */
  const [logoLoadError, setLogoLoadError] = React.useState(false);
  React.useEffect(() => {
    setLogoLoadError(false);
  }, [profile?.logo_url]);

  const loadProfile = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/company-profile", {
        method: "GET",
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: CompanyProfile; fallback?: string; message?: string }
        | null;

      if (res.ok && json?.ok && json.profile) {
        setProfile(json.profile);
        setForm(toFormState(json.profile));
        return;
      }

      if (res.status !== 503 || json?.fallback !== "client") {
        const msg = json?.message || `Load failed (${res.status}).`;
        toast({ title: "Load failed", description: msg, variant: "error" });
        return;
      }

      const row = await ensureCompanyProfile(supabase);
      setProfile(row);
      setForm(toFormState(row));
    } catch (e: unknown) {
      try {
        const row = await ensureCompanyProfile(supabase);
        setProfile(row);
        setForm(toFormState(row));
      } catch {
        const msg = e instanceof Error ? e.message : String(e);
        toast({ title: "Load failed", description: msg || "Failed to load company profile.", variant: "error" });
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const dispatchCompanyProfileMutationSync = React.useCallback((reason: string) => {
    suppressNextCompanyProfileSyncReloadRef.current = true;
    dispatchClientDataSync({ reason });
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      if (suppressNextCompanyProfileSyncReloadRef.current) {
        suppressNextCompanyProfileSyncReloadRef.current = false;
        return;
      }
      void loadProfile();
    }, [loadProfile]),
    [loadProfile]
  );

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = () => {
    if (!supabase || !configured || !profile) return;
    const emailErr = validateCompanyProfileEmailField(form.email);
    if (emailErr) {
      toast({ title: "Invalid email", description: emailErr, variant: "error" });
      return;
    }
    const prevProfile = profile;
    const formAtSave = { ...form };
    const n = Number(formAtSave.default_tax_pct);
    const defaultTaxPct = Number.isFinite(n) ? Math.max(0, n) : 0;
    const persistPayload = {
      org_name: formAtSave.org_name.trim() || "HH Group",
      legal_name: toNullable(formAtSave.legal_name),
      phone: toNullable(formAtSave.phone),
      email: toNullable(formAtSave.email),
      website: toNullable(formAtSave.website),
      license_number: toNullable(formAtSave.license_number),
      tax_id: toNullable(formAtSave.tax_id),
      default_tax_pct: defaultTaxPct,
      address1: toNullable(formAtSave.address1),
      address2: toNullable(formAtSave.address2),
      city: toNullable(formAtSave.city),
      state: toNullable(formAtSave.state),
      zip: toNullable(formAtSave.zip),
      country: toNullable(formAtSave.country) ?? "US",
      invoice_footer: toNullable(formAtSave.invoice_footer),
      default_terms: toNullable(formAtSave.default_terms),
      notes: toNullable(formAtSave.notes),
    };

    type Snap = { profile: CompanyProfile; form: FormState };
    runOptimisticPersist<Snap>({
      setBusy: setSaving,
      getSnapshot: () => ({ profile: prevProfile, form: { ...formAtSave } }),
      apply: () => {
        setProfile(mergeFormIntoProfile(formAtSave, prevProfile));
      },
      rollback: (s) => {
        setProfile(s.profile);
        setForm(s.form);
      },
      persist: async () => {
        const auth = await authHeadersForLogoApi(supabase);
        try {
          const res = await fetch("/api/settings/company-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            credentials: "include",
            body: JSON.stringify(persistPayload),
          });
          const json = (await res.json().catch(() => null)) as
            | { ok?: boolean; profile?: CompanyProfile; message?: string; fallback?: string }
            | null;

          if (res.ok && json?.ok && json.profile) {
            flushSync(() => {
              setProfile(json.profile!);
              setForm(toFormState(json.profile!));
            });
            dispatchCompanyProfileMutationSync("company-profile-save");
            return undefined;
          }

          const useClientFallback =
            (res.status === 503 && json?.fallback === "client") ||
            res.status === 401 ||
            res.status === 403;

          if (!useClientFallback) {
            return { error: json?.message || `Save failed (${res.status}).` };
          }
        } catch {
          /* network error — try direct Supabase below */
        }

        try {
          const updated = await saveCompanyProfile(supabase, persistPayload);
          flushSync(() => {
            setProfile(updated);
            setForm(toFormState(updated));
          });
          dispatchCompanyProfileMutationSync("company-profile-save");
          return undefined;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { error: msg || "Failed to save profile." };
        }
      },
      onError: (msg) =>
        toast({ title: "Save failed", description: msg || "Failed to save profile.", variant: "error" }),
      onSuccess: () => toast({ title: "Saved", variant: "success" }),
    });
  };

  const processFile = async (file: File | null | undefined) => {
    if (!file || !supabase) return;
    const logoErr = validateLogoFileForUpload(file);
    if (logoErr) {
      toast({ title: "Upload failed", description: logoErr, variant: "error" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const auth = await authHeadersForLogoApi(supabase);
      const res = await fetch("/api/settings/company-logo", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: auth,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: CompanyProfile; message?: string; fallback?: string }
        | null;

      if (res.ok && json?.ok && json.profile) {
        setProfile(json.profile);
        setLogoLoadError(false);
        toast({ title: "Logo uploaded", variant: "success" });
        dispatchCompanyProfileMutationSync("company-logo-upload");
        return;
      }

      // 401: no SSR session but browser may still upload via anon RLS. 503/403: same client fallback.
      if (
        (res.status === 503 && json?.fallback === "client") ||
        res.status === 403 ||
        res.status === 401
      ) {
        try {
          const result = await uploadCompanyLogo(supabase, file);
          setProfile(result.profile);
          setLogoLoadError(false);
          toast({ title: "Logo uploaded", variant: "success" });
          dispatchCompanyProfileMutationSync("company-logo-upload");
          return;
        } catch (clientErr) {
          const cmsg = clientErr instanceof Error ? clientErr.message : String(clientErr);
          toast({
            title: "Upload failed",
            description: json?.message ? `${json.message} · ${cmsg}` : cmsg,
            variant: "error",
          });
          return;
        }
      }

      const msg = json?.message || `Upload failed (${res.status}).`;
      toast({ title: "Upload failed", description: msg, variant: "error" });
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
      const auth = await authHeadersForLogoApi(supabase);
      const res = await fetch("/api/settings/company-logo", {
        method: "DELETE",
        credentials: "include",
        headers: auth,
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: CompanyProfile; message?: string; fallback?: string }
        | null;

      if (res.ok && json?.ok && json.profile) {
        setProfile(json.profile);
        setLogoLoadError(false);
        toast({ title: "Logo removed", variant: "success" });
        dispatchCompanyProfileMutationSync("company-logo-remove");
        return;
      }

      if (
        (res.status === 503 && json?.fallback === "client") ||
        res.status === 403 ||
        res.status === 401
      ) {
        try {
          const updated = await removeCompanyLogo(supabase);
          setProfile(updated);
          setLogoLoadError(false);
          toast({ title: "Logo removed", variant: "success" });
          dispatchCompanyProfileMutationSync("company-logo-remove");
          return;
        } catch (clientErr) {
          const cmsg = clientErr instanceof Error ? clientErr.message : String(clientErr);
          toast({
            title: "Remove failed",
            description: json?.message ? `${json.message} · ${cmsg}` : cmsg,
            variant: "error",
          });
          return;
        }
      }

      const msg = json?.message || `Remove failed (${res.status}).`;
      toast({ title: "Remove failed", description: msg, variant: "error" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Remove failed", description: msg || "Failed to remove logo.", variant: "error" });
    } finally {
      setUploading(false);
    }
  };

  /** Require a loaded row so Save never no-ops silently (e.g. load/RLS failure). */
  const disabled = !configured || !supabase || loading || saving || uploading || !profile;

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
            {profile?.logo_url && !logoLoadError ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL; avoids next/image remote host config errors
              <img
                src={profile.logo_url}
                alt="Company logo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-sm object-contain bg-white p-1"
                onError={() => setLogoLoadError(true)}
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
              data-testid="company-logo-input"
              aria-label="Upload company logo"
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                await processFile(file);
                input.value = "";
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

      <section className="pt-2" data-testid="company-profile-section">
        <SectionHeader title="Company Profile" subtitle="This profile is shared globally across HH Unified." />
        <div className="mt-4 grid gap-3 md:grid-cols-2" data-testid="company-profile-fields">
          <Input
            className="rounded-sm"
            placeholder="Company Name"
            value={form.org_name}
            onChange={(e) => updateField("org_name", e.target.value)}
            data-testid="company-input-org_name"
            aria-label="Company Name"
          />
          <Input
            className="rounded-sm"
            placeholder="Legal Name"
            value={form.legal_name}
            onChange={(e) => updateField("legal_name", e.target.value)}
            data-testid="company-input-legal_name"
            aria-label="Legal Name"
          />
          <Input
            className="rounded-sm"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            data-testid="company-input-phone"
            aria-label="Phone"
          />
          <Input
            className="rounded-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            data-testid="company-input-email"
            aria-label="Email"
          />
          <Input
            className="rounded-sm"
            placeholder="Website"
            value={form.website}
            onChange={(e) => updateField("website", e.target.value)}
            data-testid="company-input-website"
            aria-label="Website"
          />
          <Input
            className="rounded-sm"
            placeholder="License Number"
            value={form.license_number}
            onChange={(e) => updateField("license_number", e.target.value)}
            data-testid="company-input-license_number"
            aria-label="License Number"
          />
          <Input
            className="rounded-sm"
            placeholder="Tax ID"
            value={form.tax_id}
            onChange={(e) => updateField("tax_id", e.target.value)}
            data-testid="company-input-tax_id"
            aria-label="Tax ID"
          />
          <Input
            className="rounded-sm"
            placeholder="Default tax %"
            inputMode="decimal"
            value={form.default_tax_pct}
            onChange={(e) => updateField("default_tax_pct", e.target.value)}
          />
          <Input
            className="rounded-sm"
            placeholder="Address Line 1"
            value={form.address1}
            onChange={(e) => updateField("address1", e.target.value)}
            data-testid="company-input-address1"
            aria-label="Address Line 1"
          />
          <Input
            className="rounded-sm"
            placeholder="Address Line 2"
            value={form.address2}
            onChange={(e) => updateField("address2", e.target.value)}
            data-testid="company-input-address2"
            aria-label="Address Line 2"
          />
          <Input
            className="rounded-sm"
            placeholder="City"
            value={form.city}
            onChange={(e) => updateField("city", e.target.value)}
            data-testid="company-input-city"
            aria-label="City"
          />
          <Input
            className="rounded-sm"
            placeholder="State"
            value={form.state}
            onChange={(e) => updateField("state", e.target.value)}
            data-testid="company-input-state"
            aria-label="State"
          />
          <Input
            className="rounded-sm"
            placeholder="ZIP"
            value={form.zip}
            onChange={(e) => updateField("zip", e.target.value)}
            data-testid="company-input-zip"
            aria-label="ZIP"
          />
          <Input
            className="rounded-sm"
            placeholder="Country"
            value={form.country}
            onChange={(e) => updateField("country", e.target.value)}
            data-testid="company-input-country"
            aria-label="Country"
          />
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
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={onSave}
            className="gap-2 rounded-sm"
            data-testid="company-save-button"
          >
            <Upload className="h-4 w-4" />
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </section>
    </div>
  );
}

