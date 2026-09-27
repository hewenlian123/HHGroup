import type { SupabaseClient, User } from "@supabase/supabase-js";
export type OrganizationRole = "owner" | "admin" | "assistant";
export type OrganizationMembership = {
  organization_id: string;
  role: OrganizationRole;
  status: "active";
};
/** The caller verifies its Auth user; membership remains database-owned and immediately revocable. */
export async function getActiveOrganizationMemberships(
  client: SupabaseClient,
  user: User
): Promise<OrganizationMembership[]> {
  if (user.is_anonymous) return [];
  const { data, error } = await client
    .from("organization_memberships")
    .select("organization_id,role,status")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error || data == null) throw new Error("Organization access is unavailable.");
  return (data ?? []).filter(
    (row) => row.status === "active" && ["owner", "admin", "assistant"].includes(row.role)
  ) as OrganizationMembership[];
}
/** Assistant admission is limited to organization workspaces; other product boundaries retain their roles. */
export function isOrganizationWorkspacePath(pathname: string): boolean {
  return (
    ["/tasks", "/schedule", "/punch-list", "/inspection-log", "/site-photos"].includes(pathname) ||
    pathname.startsWith("/api/operations/") ||
    /^\/api\/tasks\/[^/]+$/.test(pathname) ||
    /^\/api\/projects\/[^/]+\/closeout\/(punch|warranty|completion|generate-punch-pdf|generate-completion-pdf)$/.test(
      pathname
    ) ||
    pathname === "/projects" ||
    /^\/projects\/[^/]+$/.test(pathname) ||
    pathname === "/projects/documents" ||
    pathname === "/documents" ||
    pathname.startsWith("/materials") ||
    pathname === "/api/projects" ||
    /^\/api\/projects\/[^/]+\/(tab|materials)$/.test(pathname) ||
    pathname.startsWith("/api/materials/") ||
    pathname.startsWith("/api/attachments/") ||
    pathname === "/upload-receipt" ||
    [
      "/api/upload-receipt/options",
      "/api/upload-receipt/upload",
      "/api/upload-receipt/submit",
    ].includes(pathname)
  );
}

/** Shared finance, labor and contacts belong to the existing company profile. */
export async function hasCompanyMembership(
  client: SupabaseClient,
  user: User,
  administratorsOnly = false
): Promise<boolean> {
  if (user.is_anonymous) return false;
  const { data, error } = await client
    .from("organization_memberships")
    .select("role,status,organizations!inner(legacy_company_profile_id)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .not("organizations.legacy_company_profile_id", "is", null);
  if (error || !Array.isArray(data)) throw new Error("Company authorization is unavailable.");
  return data.some((row) => {
    const organization = row.organizations as unknown as {
      legacy_company_profile_id?: string | null;
    };
    return (
      row.status === "active" &&
      (administratorsOnly ? ["owner", "admin"] : ["owner", "admin", "assistant"]).includes(
        row.role
      ) &&
      Boolean(organization?.legacy_company_profile_id)
    );
  });
}

export function hasCompanyAdministratorMembership(
  client: SupabaseClient,
  user: User
): Promise<boolean> {
  return hasCompanyMembership(client, user, true);
}
