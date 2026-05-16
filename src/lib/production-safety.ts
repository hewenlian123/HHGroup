import "server-only";

import { NextResponse } from "next/server";

export const INTERNAL_ADMIN_SECRET_HEADER = "x-internal-admin-secret";
export const PRODUCTION_SAFETY_LOCK_HEADER = "x-hh-production-safety-lock";

const FORBIDDEN_MESSAGE =
  "This maintenance endpoint is disabled in production. Run it in a non-production environment or provide the internal admin secret from a server-side caller.";

function configuredInternalAdminSecret(): string | null {
  const primary = process.env.HH_INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const fallback = process.env.INTERNAL_ADMIN_SECRET?.trim() ?? "";
  const value = primary.length > 0 ? primary : fallback;
  return value.length > 0 ? value : null;
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function isProductionSafetyLocked(request: Request): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    request.headers.get(PRODUCTION_SAFETY_LOCK_HEADER) === "1"
  );
}

export function hasInternalAdminSecret(request: Request): boolean {
  const expected = configuredInternalAdminSecret();
  if (!expected) return false;
  const actual = request.headers.get(INTERNAL_ADMIN_SECRET_HEADER)?.trim() ?? "";
  return actual.length > 0 && safeEqual(actual, expected);
}

export function guardDangerousMaintenanceRequest(request: Request): NextResponse | null {
  if (!isProductionSafetyLocked(request)) return null;
  if (hasInternalAdminSecret(request)) return null;

  return NextResponse.json(
    {
      ok: false,
      message: FORBIDDEN_MESSAGE,
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export function guardedInternalFetchHeaders(request: Request, init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const secret = request.headers.get(INTERNAL_ADMIN_SECRET_HEADER);
  if (secret) headers.set(INTERNAL_ADMIN_SECRET_HEADER, secret);
  if (request.headers.get(PRODUCTION_SAFETY_LOCK_HEADER) === "1") {
    headers.set(PRODUCTION_SAFETY_LOCK_HEADER, "1");
  }
  return headers;
}
