import type { User } from "@supabase/supabase-js";

export type AuthorizedAppRole = "owner" | "admin";

type AppMetadataCarrier =
  | Pick<User, "app_metadata">
  | { app_metadata?: unknown; user_metadata?: unknown }
  | null;

export function authorizedAppRole(user: AppMetadataCarrier): AuthorizedAppRole | null {
  if (!user || typeof user.app_metadata !== "object" || user.app_metadata === null) {
    return null;
  }

  const role = (user.app_metadata as Record<string, unknown>).role;
  return role === "owner" || role === "admin" ? role : null;
}

export function isAuthorizedAppRole(user: AppMetadataCarrier): boolean {
  return authorizedAppRole(user) !== null;
}
