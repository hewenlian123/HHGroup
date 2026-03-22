import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|does not exist.*column|schema cache|could not find the '.*' column/i.test(m);
}

function isUniqueViolationError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = err.message ?? "";
  return /duplicate key|unique constraint|already exists/i.test(m);
}

/** Extract the offending column name from a PostgREST schema-cache error message. */
function extractMissingColumnName(msg: string): string | null {
  // "Could not find the 'address1' column of 'company_profile' in the schema cache"
  const m1 = msg.match(/could not find the '([^']+)' column/i);
  if (m1) return m1[1];
  // "column \"address1\" does not exist"
  const m2 = msg.match(/column "([^"]+)" does not exist/i);
  if (m2) return m2[1];
  return null;
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
    /** Prefer the row that was updated most recently (fixes multi-row DBs where an old row had no logo). */
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
  return (data?.[0] as CompanyProfile | undefined) ?? null;
}

function profileRowToInput(row: CompanyProfile): CompanyProfileInput {
  return {
    org_name: row.org_name,
    legal_name: row.legal_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    license_number: row.license_number,
    tax_id: row.tax_id,
    default_tax_pct: row.default_tax_pct,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country ?? "US",
    invoice_footer: row.invoice_footer,
    default_terms: row.default_terms,
    notes: row.notes,
    logo_path: row.logo_path,
    logo_url: row.logo_url,
  };
}

/**
 * Merge DB row + patch so omitted keys (e.g. logo on form save) do not wipe columns.
 */
export function mergeCompanyProfileInput(
  current: CompanyProfile | null,
  patch: Partial<CompanyProfileInput>
): CompanyProfileInput {
  const base = current ? profileRowToInput(current) : { ...DEFAULT_PROFILE };
  const merged: CompanyProfileInput = { ...base, ...patch };
  merged.org_name = (merged.org_name ?? "HH Group").trim() || "HH Group";
  return merged;
}

/** Parse JSON body for POST /api/settings/company-profile (only known scalar keys). */
export function parseCompanyProfileSaveBody(raw: unknown): Partial<CompanyProfileInput> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid JSON body.");
  }
  const o = raw as Record<string, unknown>;
  const out: Partial<CompanyProfileInput> = {};

  const str = (k: string): string | null | undefined => {
    if (!(k in o)) return undefined;
    const v = o[k];
    if (v === null) return null;
    if (typeof v === "string") return v;
    throw new Error(`Invalid type for ${k}`);
  };

  const num = (k: string): number | null | undefined => {
    if (!(k in o)) return undefined;
    const v = o[k];
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    throw new Error(`Invalid type for ${k}`);
  };

  const maybe = <K extends keyof CompanyProfileInput>(key: K, v: CompanyProfileInput[K] | undefined) => {
    if (v !== undefined) out[key] = v;
  };

  // Accept org_name (DB) or orgName (some clients); snake_case wins if both sent.
  const orgSnake = str("org_name");
  const orgCamel =
    "orgName" in o && typeof o.orgName === "string"
      ? o.orgName
      : "orgName" in o && o.orgName === null
        ? null
        : undefined;
  const orgResolved = orgSnake !== undefined ? orgSnake : orgCamel;
  maybe("org_name", orgResolved ?? undefined);
  maybe("legal_name", str("legal_name"));
  maybe("phone", str("phone"));
  maybe("email", str("email"));
  maybe("website", str("website"));
  maybe("license_number", str("license_number"));
  maybe("tax_id", str("tax_id"));
  const dtp = num("default_tax_pct");
  if (dtp !== undefined && dtp !== null) maybe("default_tax_pct", Math.max(0, dtp));
  if (dtp === null) maybe("default_tax_pct", null);
  maybe("address1", str("address1"));
  maybe("address2", str("address2"));
  maybe("city", str("city"));
  maybe("state", str("state"));
  maybe("zip", str("zip"));
  maybe("country", str("country"));
  maybe("invoice_footer", str("invoice_footer"));
  maybe("default_terms", str("default_terms"));
  maybe("notes", str("notes"));
  maybe("logo_path", str("logo_path"));
  maybe("logo_url", str("logo_url"));

  return out;
}

export async function ensureCompanyProfile(client: SupabaseClient): Promise<CompanyProfile> {
  const existing = await getCompanyProfile(client);
  if (existing) return existing;

  // Retry up to 15 times, stripping whichever column the DB doesn't recognise each time.
  const payload: Record<string, unknown> = { ...DEFAULT_PROFILE };
  for (let i = 0; i < 15; i++) {
    const { data, error } = await client.from("company_profile").insert(payload).select("*").single();
    if (!error && data) return data as CompanyProfile;

    if (error && isUniqueViolationError(error)) {
      // Row already exists (e.g. singleton index) but SELECT returned nothing — retry read after a short delay.
      for (let r = 0; r < 8; r++) {
        await new Promise((res) => setTimeout(res, 40 * (r + 1)));
        const again = await getCompanyProfile(client);
        if (again) return again;
      }
      throw new Error(
        "company_profile already exists but cannot be read with the current key (RLS). Run anon/authenticated SELECT policies, or save via POST /api/settings/company-profile with SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    if (error && isMissingColumn(error)) {
      const col = extractMissingColumnName(error.message);
      if (col && col in payload) {
        // Never drop org_name: stripping it makes saves "succeed" while the DB still shows the default name.
        if (col === "org_name") {
          throw new Error(
            "company_profile.org_name is missing in the database. Apply migrations so company_profile includes org_name."
          );
        }
        delete payload[col];
        continue;
      }
    }
    if (error) throw new Error(error.message);
  }
  throw new Error("Failed to create company profile: too many unrecognised columns.");
}

/**
 * Upsert-style save: merge with latest row so partial updates never clear unspecified fields.
 * Update uses explicit id; insert when no row. Fails loudly on 0-row update (RLS / wrong id).
 */
export async function saveCompanyProfile(
  client: SupabaseClient,
  values: Partial<CompanyProfileInput>
): Promise<CompanyProfile> {
  const current = await getCompanyProfile(client);
  const merged = mergeCompanyProfileInput(current, values);

  let payload: Record<string, unknown> = { ...merged };
  for (let i = 0; i < 15; i++) {
    if (current) {
      const { data, error } = await client
        .from("company_profile")
        .update(payload)
        .eq("id", current.id)
        .select("*");
      if (error) {
        if (isMissingColumn(error)) {
          const col = extractMissingColumnName(error.message);
          if (col && col in payload) {
            if (col === "org_name") {
              throw new Error(
                "company_profile.org_name is missing in the database. Apply migrations so company_profile includes org_name."
              );
            }
            delete payload[col];
            continue;
          }
        }
        throw new Error(error.message);
      }
      const row = data?.[0] as CompanyProfile | undefined;
      if (!row) {
        throw new Error(
          "Company profile was not updated (0 rows). Check RLS policies for update on company_profile."
        );
      }
      return { ...row, org_name: merged.org_name };
    }

    const { data, error } = await client.from("company_profile").insert(payload).select("*").single();
    if (!error && data) return { ...(data as CompanyProfile), org_name: merged.org_name };
    if (error) {
      if (isMissingColumn(error)) {
        const col = extractMissingColumnName(error.message);
        if (col && col in payload) {
          if (col === "org_name") {
            throw new Error(
              "company_profile.org_name is missing in the database. Apply migrations so company_profile includes org_name."
            );
          }
          delete payload[col];
          continue;
        }
      }
      throw new Error(error.message);
    }
    throw new Error("Insert returned no data.");
  }
  throw new Error("Failed to save company profile: too many unrecognised columns.");
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

