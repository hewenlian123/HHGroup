import { unstable_noStore as noStore } from "next/cache";
import type { CompanyProfile } from "@/lib/company-profile";
import { getCompanyLogoPublicUrl, getCompanyProfile } from "@/lib/company-profile";
import { getServerSupabase } from "@/lib/supabase-server";

/**
 * Serializable company block for invoices, estimates, receipts, statements (pages + PDF).
 * Built only from `company_profile` — no hardcoded branding in consumers.
 */
export type DocumentCompanyProfileDTO = {
  companyName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  licenseNumber: string | null;
  /** Non-empty lines only; compact (no blank rows). */
  addressLines: string[];
  logoUrl: string | null;
};

function buildAddressLinesFromProfile(profile: CompanyProfile | null): string[] {
  if (!profile) return [];
  const lines: string[] = [];
  const a1 = profile.address1?.trim();
  const a2 = profile.address2?.trim();
  if (a1 || a2) {
    lines.push([a1, a2].filter(Boolean).join(", "));
  }
  const city = profile.city?.trim();
  const state = profile.state?.trim();
  const zip = profile.zip?.trim();
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityLine = zip ? (cityState ? `${cityState} ${zip}` : zip) : cityState;
  if (cityLine) lines.push(cityLine);
  return lines;
}

export function companyProfileToDocumentDto(
  profile: CompanyProfile | null
): DocumentCompanyProfileDTO {
  const companyName = profile?.org_name?.trim() || "HH Group";
  return {
    companyName,
    phone: profile?.phone?.trim() || null,
    email: profile?.email?.trim() || null,
    website: profile?.website?.trim() || null,
    licenseNumber: profile?.license_number?.trim() || null,
    addressLines: buildAddressLinesFromProfile(profile),
    logoUrl: profile?.logo_url?.trim() || null,
  };
}

/**
 * Server / API: load first `company_profile` row (service role when configured).
 */
export async function fetchDocumentCompanyProfile(): Promise<DocumentCompanyProfileDTO> {
  noStore();
  const client = getServerSupabase();
  if (!client) {
    return companyProfileToDocumentDto(null);
  }
  try {
    const row = await getCompanyProfile(client);
    if (row?.logo_path?.trim() && !row.logo_url?.trim()) {
      const url = getCompanyLogoPublicUrl(client, row.logo_path.trim());
      return companyProfileToDocumentDto({ ...row, logo_url: url });
    }
    return companyProfileToDocumentDto(row);
  } catch {
    return companyProfileToDocumentDto(null);
  }
}
