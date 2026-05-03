import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyProfile } from "@/lib/company-profile";
import { getCompanyProfile } from "@/lib/company-profile";

export const companyProfileQueryKey = ["company_profile"] as const;

export async function fetchCompanyProfileForNav(
  client: SupabaseClient
): Promise<CompanyProfile | null> {
  return getCompanyProfile(client);
}
