import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  hasInternalAdminSecret,
  hasLocalTestAuthBypass,
  isProductionSafetyLocked,
} from "@/lib/production-safety";
import { getSupabaseUserFromRequest } from "@/lib/supabase-server";

type AuthBoundaryContext = {
  user: User | null;
  email: string | null;
  isProductionLocked: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasInternalAdminAccess: boolean;
  hasLocalTestBypass: boolean;
};

type GuardResult =
  | { ok: true; context: AuthBoundaryContext }
  | { ok: false; response: NextResponse };

type GuardOptions = {
  allowLocalBypass?: boolean;
};

const AUTH_REQUIRED_MESSAGE = "Authentication required.";
const ADMIN_REQUIRED_MESSAGE = "Admin access required.";
const MAINTENANCE_DISABLED_MESSAGE =
  "This maintenance endpoint is disabled in production. Run it in a non-production environment or provide authenticated admin/internal access.";

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.HH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function userHasAdminRole(user: User | null): boolean {
  const role = user?.app_metadata?.role;
  return role === "owner" || role === "admin";
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

  const user = hasLocalTestBypass
    ? null
    : await getSupabaseUserFromRequest(request).catch(() => null);
  const email = user?.email?.trim().toLowerCase() ?? null;
  const adminEmails = parseAdminEmails();
  const isAdminUser = Boolean(
    user && (userHasAdminRole(user) || (email && adminEmails.has(email)))
  );

  return {
    user,
    email,
    isProductionLocked,
    hasInternalAdminAccess,
    hasLocalTestBypass,
    isAuthenticated: Boolean(user || hasInternalAdminAccess || hasLocalTestBypass),
    isAdmin: Boolean(hasInternalAdminAccess || hasLocalTestBypass || isAdminUser),
  };
}

export async function requireAuthenticatedUser(
  request: Request,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const context = await getRequestAuthContext(request);
  if (!context.isProductionLocked && options.allowLocalBypass !== false) {
    return { ok: true, context };
  }
  if (context.isAuthenticated) return { ok: true, context };
  return { ok: false, response: jsonError(401, AUTH_REQUIRED_MESSAGE) };
}

export async function requireAdminUser(
  request: Request,
  options: GuardOptions = {}
): Promise<GuardResult> {
  const context = await getRequestAuthContext(request);
  if (!context.isProductionLocked && options.allowLocalBypass !== false) {
    return { ok: true, context };
  }
  if (context.isAdmin) return { ok: true, context };
  return { ok: false, response: jsonError(403, ADMIN_REQUIRED_MESSAGE) };
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
