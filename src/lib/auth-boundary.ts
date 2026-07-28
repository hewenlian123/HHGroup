import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { authorizedAppRole, type AuthorizedAppRole } from "@/lib/auth-role";
import {
  hasInternalAdminSecret,
  hasLocalTestAuthBypass,
  isProductionSafetyLocked,
} from "@/lib/production-safety";
import { isOwnerInternalNoLoginEnabled } from "@/lib/owner-access-mode";
import { getSupabaseUserFromRequest } from "@/lib/supabase-server";

type AuthBoundaryContext = {
  user: User | null;
  email: string | null;
  isProductionLocked: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasPinSession: boolean;
  hasOwnerInternalNoLoginAccess: boolean;
  hasInternalAdminAccess: boolean;
  hasLocalTestBypass: boolean;
};

export type GuardResult =
  | { ok: true; context: AuthBoundaryContext }
  | { ok: false; response: NextResponse };

export type StrictAuthContext = {
  user: User;
  email: string | null;
  role: AuthorizedAppRole;
};

export type StrictGuardResult =
  | { ok: true; context: StrictAuthContext }
  | { ok: false; response: NextResponse };

type GuardOptions = {
  allowLocalBypass?: boolean;
};

const AUTH_REQUIRED_MESSAGE = "Authentication required.";
const ADMIN_REQUIRED_MESSAGE = "Admin access required.";
const MAINTENANCE_DISABLED_MESSAGE =
  "This maintenance endpoint is disabled in production. Run it in a non-production environment or provide authenticated admin/internal access.";

function userHasAdminRole(user: User | null): boolean {
  return authorizedAppRole(user) !== null;
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function getRequestAuthContext(request: Request): Promise<AuthBoundaryContext> {
  const hasInternalAdminAccess = hasInternalAdminSecret(request);
  const hasLocalTestBypass = hasLocalTestAuthBypass(request);
  const isProductionLocked = isProductionSafetyLocked(request);
  const hasOwnerInternalNoLoginAccess = isOwnerInternalNoLoginEnabled();
  const hasPinSession = false;

  const user = hasLocalTestBypass
    ? null
    : await getSupabaseUserFromRequest(request).catch(() => null);
  const email = user?.email?.trim().toLowerCase() ?? null;
  const isAdminUser = userHasAdminRole(user);

  return {
    user,
    email,
    isProductionLocked,
    hasInternalAdminAccess,
    hasLocalTestBypass,
    hasPinSession,
    hasOwnerInternalNoLoginAccess,
    isAuthenticated: Boolean(user || hasOwnerInternalNoLoginAccess || hasLocalTestBypass),
    isAdmin: Boolean(hasOwnerInternalNoLoginAccess || hasLocalTestBypass || isAdminUser),
  };
}

export async function requireAuthenticatedUser(
  request: Request,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const context = await getRequestAuthContext(request);
  void options;
  if (context.isAuthenticated) return { ok: true, context };
  return { ok: false, response: jsonError(401, AUTH_REQUIRED_MESSAGE) };
}

export async function requireAdminUser(
  request: Request,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const context = await getRequestAuthContext(request);
  void options;
  if (context.isAdmin) return { ok: true, context };
  return { ok: false, response: jsonError(403, ADMIN_REQUIRED_MESSAGE) };
}

export async function requireSupabaseOwnerOrAdmin(request: Request): Promise<StrictGuardResult> {
  const user = await getSupabaseUserFromRequest(request).catch(() => null);
  if (!user) {
    return { ok: false, response: jsonError(401, AUTH_REQUIRED_MESSAGE) };
  }

  const role = authorizedAppRole(user);
  if (!role) {
    return { ok: false, response: jsonError(403, ADMIN_REQUIRED_MESSAGE) };
  }

  return {
    ok: true,
    context: {
      user,
      role,
      email: user.email?.trim().toLowerCase() ?? null,
    },
  };
}

export async function requireInternalAdminAccess(
  request: Request,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const context = await getRequestAuthContext(request);
  if (!context.isProductionLocked && options.allowLocalBypass !== false) {
    return { ok: true, context };
  }
  if (context.isAdmin) return { ok: true, context };
  return { ok: false, response: jsonError(403, MAINTENANCE_DISABLED_MESSAGE) };
}
