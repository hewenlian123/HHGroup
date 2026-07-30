import { NextResponse, type NextRequest } from "next/server";

import { createRouteSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";
import {
  createSignedDeviceToken,
  DEVICE_UNLOCK_COOKIE,
  sessionIdFromAccessToken,
  TRUSTED_DEVICE_COOKIE,
  type DeviceUnlockPayload,
} from "@/lib/device-unlock-token";

export {
  createSignedDeviceToken,
  DEVICE_UNLOCK_COOKIE,
  readDeviceCookie,
  readSignedDeviceToken,
  sessionIdFromAccessToken,
  TRUSTED_DEVICE_COOKIE,
  type DeviceUnlockPayload,
} from "@/lib/device-unlock-token";

const PIN_PATTERN = /^\d{6}$/;
const PIN_HASH_ITERATIONS = 310_000;
const LOCK_AFTER_FAILURES = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const DEVICE_UNLOCK_MAX_AGE_SECONDS = 10 * 60 * 60;
const TRUSTED_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const COMMON_PINS = new Set([
  "000000",
  "111111",
  "123123",
  "123456",
  "222222",
  "333333",
  "444444",
  "555555",
  "654321",
  "666666",
  "777777",
  "888888",
  "999999",
]);

export type StoredQuickUnlockPin = {
  hash: string;
  salt: string;
  iterations: number;
};

export type QuickUnlockValidation = { ok: true; value: string } | { ok: false; message: string };

export type QuickUnlockVerification =
  | { ok: true; pinVersion: number }
  | {
      ok: false;
      reason: "disabled" | "invalid" | "locked" | "unavailable";
      retryAfterSeconds?: number;
    };

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function derivePinHash(pin: string, salt: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encodeText(pin)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: toArrayBuffer(base64UrlToBytes(salt)),
    },
    keyMaterial,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export function validateQuickUnlockPin(value: unknown): QuickUnlockValidation {
  if (typeof value !== "string" || !PIN_PATTERN.test(value)) {
    return { ok: false, message: "PIN must contain exactly 6 digits." };
  }
  if (COMMON_PINS.has(value) || /^(\d)\1{5}$/.test(value)) {
    return { ok: false, message: "Choose a less common PIN." };
  }
  return { ok: true, value };
}

export async function hashQuickUnlockPin(
  pin: string,
  salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24))),
  iterations = PIN_HASH_ITERATIONS
): Promise<StoredQuickUnlockPin> {
  const validation = validateQuickUnlockPin(pin);
  if (!validation.ok) throw new Error(validation.message);
  return {
    hash: await derivePinHash(validation.value, salt, iterations),
    salt,
    iterations,
  };
}

export async function verifyQuickUnlockPinHash(
  pin: string,
  stored: StoredQuickUnlockPin
): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;
  const candidate = await derivePinHash(pin, stored.salt, stored.iterations);
  return safeEqual(candidate, stored.hash);
}

export function nextPinFailureState(
  current: { failedAttempts: number; lockedUntil: Date | null },
  now = new Date()
): { failedAttempts: number; lockedUntil: Date | null } {
  const failedAttempts = current.failedAttempts + 1;
  return {
    failedAttempts,
    lockedUntil:
      failedAttempts >= LOCK_AFTER_FAILURES
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : current.lockedUntil,
  };
}

export async function setDeviceUnlockCookies(
  response: NextResponse,
  input: Omit<DeviceUnlockPayload, "exp" | "v">
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const unlock = await createSignedDeviceToken({
    ...input,
    exp: now + DEVICE_UNLOCK_MAX_AGE_SECONDS,
    v: 1,
  });
  const trusted = await createSignedDeviceToken({
    ...input,
    exp: now + TRUSTED_DEVICE_MAX_AGE_SECONDS,
    v: 1,
  });
  if (!unlock || !trusted) return false;

  const baseOptions = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isProductionRuntime(),
  };
  response.cookies.set(DEVICE_UNLOCK_COOKIE, unlock, {
    ...baseOptions,
    maxAge: DEVICE_UNLOCK_MAX_AGE_SECONDS,
  });
  response.cookies.set(TRUSTED_DEVICE_COOKIE, trusted, {
    ...baseOptions,
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
  return true;
}

export function clearDeviceUnlockCookie(response: NextResponse): void {
  response.cookies.set(DEVICE_UNLOCK_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isProductionRuntime(),
  });
}

export function clearTrustedDeviceCookie(response: NextResponse): void {
  response.cookies.set(TRUSTED_DEVICE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isProductionRuntime(),
  });
}

export async function getRequestSessionId(request: NextRequest): Promise<string | null> {
  const response = NextResponse.next();
  const supabase = createRouteSupabaseClient(request, response);
  if (!supabase) return null;
  const { data: verifiedClaims } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const verifiedSessionId = verifiedClaims?.claims.session_id;
  if (typeof verifiedSessionId === "string" && verifiedSessionId) {
    return verifiedSessionId;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? sessionIdFromAccessToken(session.access_token) : null;
}

type SecuritySettingsRow = {
  pin_hash: string | null;
  pin_salt: string | null;
  pin_iterations: number;
  pin_version: number;
  failed_attempts: number;
  locked_until: string | null;
};

export async function getQuickUnlockStateForUser(
  userId: string
): Promise<SecuritySettingsRow | null> {
  const admin = getServerSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("app_user_security_settings")
    .select("pin_hash,pin_salt,pin_iterations,pin_version,failed_attempts,locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SecuritySettingsRow;
}

export async function verifyQuickUnlockForUser(
  userId: string,
  pin: string
): Promise<QuickUnlockVerification> {
  const admin = getServerSupabaseAdmin();
  if (!admin) return { ok: false, reason: "unavailable" };
  const state = await getQuickUnlockStateForUser(userId);
  if (!state?.pin_hash || !state.pin_salt) {
    return { ok: false, reason: "disabled" };
  }

  const now = new Date();
  const lockedUntil = state.locked_until ? new Date(state.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: "locked",
      retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
    };
  }

  const valid = await verifyQuickUnlockPinHash(pin, {
    hash: state.pin_hash,
    salt: state.pin_salt,
    iterations: state.pin_iterations,
  });
  if (!valid) {
    const next = nextPinFailureState(
      {
        failedAttempts: state.failed_attempts,
        lockedUntil,
      },
      now
    );
    await admin
      .from("app_user_security_settings")
      .update({
        failed_attempts: next.failedAttempts,
        locked_until: next.lockedUntil?.toISOString() ?? null,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);
    return {
      ok: false,
      reason: next.lockedUntil ? "locked" : "invalid",
      retryAfterSeconds: next.lockedUntil
        ? Math.ceil((next.lockedUntil.getTime() - now.getTime()) / 1000)
        : undefined,
    };
  }

  await admin
    .from("app_user_security_settings")
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId);
  return { ok: true, pinVersion: state.pin_version };
}
