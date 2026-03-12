import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column|schema cache/i.test(m);
}

export type CompanyProfile = {
  id: string;
  created_at: string;
  updated_at: string;
  org_name: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  license_number: string | null;
  tax_id: string | null;
  default_tax_pct: number | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  invoice_footer: string | null;
  default_terms: string | null;
  notes: string | null;
  logo_path: string | null;
  logo_url: string | null;
};

export type CompanyProfileInput = Omit<CompanyProfile, "id" | "created_at" | "updated_at">;

const DEFAULT_PROFILE: CompanyProfileInput = {
  org_name: "HH Group",
  legal_name: null,
  phone: null,
  email: null,
  website: null,
  license_number: null,
  tax_id: null,
  default_tax_pct: 0,
  address1: null,
  address2: null,
  city: null,
  state: null,
  zip: null,
  country: "US",
  invoice_footer: null,
  default_terms: null,
  notes: null,
  logo_path: null,
  logo_url: null,
};

export function getCompanyLogoPublicUrl(client: SupabaseClient, path: string): string {
  const { data } = client.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}

export async function getCompanyProfile(client: SupabaseClient): Promise<CompanyProfile | null> {
  const { data, error } = await client
    .from("company_profile")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
  return (data?.[0] as CompanyProfile | undefined) ?? null;
}

export async function ensureCompanyProfile(client: SupabaseClient): Promise<CompanyProfile> {
  const existing = await getCompanyProfile(client);
  if (existing) return existing;

  const { data, error } = await client
    .from("company_profile")
    .insert(DEFAULT_PROFILE)
    .select("*")
    .single();
  if (!error) return data as CompanyProfile;

  if (isMissingColumn(error)) {
    // Retry without newer columns (e.g. default_tax_pct not yet migrated).
    const { default_tax_pct: _omit, ...baseProfile } = DEFAULT_PROFILE;
    void _omit;
    const retry = await client.from("company_profile").insert(baseProfile).select("*").single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data as CompanyProfile;
  }
  throw new Error(error.message);
}

export async function saveCompanyProfile(
  client: SupabaseClient,
  values: Partial<CompanyProfileInput>
): Promise<CompanyProfile> {
  const current = await ensureCompanyProfile(client);
  const { data, error } = await client
    .from("company_profile")
    .update(values)
    .eq("id", current.id)
    .select("*")
    .single();
  if (!error) return data as CompanyProfile;

  if (isMissingColumn(error)) {
    // Retry without columns that may not exist yet (e.g. default_tax_pct).
    const { default_tax_pct: _omit, ...safeValues } = values as Partial<CompanyProfileInput> & { default_tax_pct?: unknown };
    void _omit;
    const retry = await client
      .from("company_profile")
      .update(safeValues)
      .eq("id", current.id)
      .select("*")
      .single();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data as CompanyProfile;
  }
  throw new Error(error.message);
}

export async function uploadCompanyLogo(
  client: SupabaseClient,
  file: File
): Promise<{ path: string; url: string; profile: CompanyProfile }> {
  const extension = file.name.includes(".") ? file.name.split(".").pop() ?? "png" : "png";
  const safeExt = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `company/logo.${safeExt}`;

  const { error: uploadError } = await client.storage.from("branding").upload(path, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (uploadError) throw new Error(uploadError.message);

  const url = getCompanyLogoPublicUrl(client, path);
  const profile = await saveCompanyProfile(client, {
    logo_path: path,
    logo_url: url,
  });
  return { path, url, profile };
}

export async function removeCompanyLogo(client: SupabaseClient): Promise<CompanyProfile> {
  const current = await ensureCompanyProfile(client);
  if (current.logo_path) {
    await client.storage.from("branding").remove([current.logo_path]);
  }
  return saveCompanyProfile(client, { logo_path: null, logo_url: null });
}

export function getCompanyInitials(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "HH";
  const words = clean.split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "HH";
}

