import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { authorizedAppRole, type AuthorizedAppRole } from "@/lib/auth-role";
import {
  hasInternalAdminSecret,
  hasLocalTestAuthBypass,
  isProductionSafetyLocked,
} from "@/lib/production-safety";
import { isCompatibilityAccessEnabled } from "@/lib/owner-access-mode";
import { parseRequestAuthorization } from "@/lib/request-authorization";
import {
  createRouteSupabaseClient,
  createServerSupabaseClient,
  getSupabaseUserFromRequest,
  getSupabaseUserFromServerSession,
} from "@/lib/supabase-server";

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

export type StrictClientGuardResult<T> =
  | { ok: true; context: StrictAuthContext; client: T | null }
  | { ok: false; response: NextResponse };

export type StrictRequestClientGuardResult =
  | {
      ok: true;
      context: StrictAuthContext;
      client: SupabaseClient;
      sessionResponse: NextResponse;
    }
  | { ok: false; response: NextResponse };

export type StrictServerActionClientGuardResult<T> =
  | { ok: true; context: StrictAuthContext; client: T | null }
  | { ok: false; status: 401 | 403; error: string };

export type StrictServerActionSessionClientGuardResult =
  | { ok: true; context: StrictAuthContext; client: SupabaseClient }
  | { ok: false; status: 401 | 403; error: string };

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
  const hasOwnerInternalNoLoginAccess = isCompatibilityAccessEnabled();
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
  return strictGuardForUser(user);
}

/**
 * Build one request-scoped RLS client, verify its Supabase identity, and return
 * that exact client for every query in the request. A presented Bearer token is
 * authoritative: malformed or invalid Bearer credentials never fall back to cookies.
 */
export async function requireSupabaseOwnerOrAdminRequestClient(
  request: Request,
  options: { noStore?: boolean } = {}
): Promise<StrictRequestClientGuardResult> {
  const authorization = parseRequestAuthorization(request.headers.get("authorization"));
  if (authorization.kind === "malformed") {
    return { ok: false, response: jsonError(401, AUTH_REQUIRED_MESSAGE) };
  }

  const sessionResponse = NextResponse.next();
  const client = createRouteSupabaseClient(request, sessionResponse, {
    noStore: options.noStore,
    forwardAuthorization: true,
  });
  if (!client) {
    return {
      ok: false,
      response: jsonError(503, "Authenticated Supabase session is not configured."),
    };
  }

  const authResult = await client.auth
    .getUser(authorization.kind === "bearer" ? authorization.token : undefined)
    .catch(() => ({ data: { user: null }, error: new Error("Authentication failed.") }));
  if (authResult.error) {
    return { ok: false, response: jsonError(401, AUTH_REQUIRED_MESSAGE) };
  }
  const guard = strictGuardForUser(authResult.data.user);
  if (!guard.ok) return guard;
  return { ...guard, client, sessionResponse };
}

function strictGuardForUser(user: User | null): StrictGuardResult {
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

/**
 * Verify a strict owner/admin request boundary before constructing any privileged client.
 * Compatibility mode, local bypasses, headers, and PIN state never satisfy this gate.
 */
export async function requireSupabaseOwnerOrAdminWithClient<T>(
  request: Request,
  createClient: () => T | null
): Promise<StrictClientGuardResult<T>> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard;
  return { ...guard, client: createClient() };
}

/** Verify the server-owned Supabase session for Server Actions without any compatibility path. */
export async function requireSupabaseOwnerOrAdminServerAction(): Promise<StrictGuardResult> {
  const user = await getSupabaseUserFromServerSession().catch(() => null);
  return strictGuardForUser(user);
}

/** Verify the cookie identity and run Server Action queries through that exact RLS client. */
export async function requireSupabaseOwnerOrAdminServerActionClient(
  options: { noStore?: boolean } = {}
): Promise<StrictServerActionSessionClientGuardResult> {
  const client = await createServerSupabaseClient(options).catch(() => null);
  if (!client) return { ok: false, status: 401, error: AUTH_REQUIRED_MESSAGE };
  const authResult = await client.auth
    .getUser()
    .catch(() => ({ data: { user: null }, error: new Error("Authentication failed.") }));
  if (authResult.error) return { ok: false, status: 401, error: AUTH_REQUIRED_MESSAGE };
  const guard = strictGuardForUser(authResult.data.user);
  if (guard.ok) return { ...guard, client };
  return {
    ok: false,
    status: guard.response.status === 403 ? 403 : 401,
    error: guard.response.status === 403 ? ADMIN_REQUIRED_MESSAGE : AUTH_REQUIRED_MESSAGE,
  };
}

/**
 * Verify a strict owner/admin Server Action boundary before constructing any privileged client.
 * The scalar failure result is safe to return from Server Actions and avoids serializing a Response.
 */
export async function requireSupabaseOwnerOrAdminServerActionWithClient<T>(
  createClient: () => T | null
): Promise<StrictServerActionClientGuardResult<T>> {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (guard.ok) return { ...guard, client: createClient() };
  return {
    ok: false,
    status: guard.response.status === 403 ? 403 : 401,
    error: guard.response.status === 403 ? ADMIN_REQUIRED_MESSAGE : AUTH_REQUIRED_MESSAGE,
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
