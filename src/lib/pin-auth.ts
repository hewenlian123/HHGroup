import { NextResponse } from "next/server";

export const PIN_SESSION_COOKIE = "hh_pin_session";

const PIN_SETTINGS_KEY = "login_pin";
const PIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 10;
const PIN_HASH_ITERATIONS = 210_000;
const PIN_PATTERN = /^\d{4}$/;

type CookieReader = {
  cookies?: {
    get(name: string): { value?: string } | undefined;
  };
  headers?: Headers;
};

type PinSessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  nonce: string;
  sessionVersion: number;
};

type PinSettings =
  | {
      status: "ready";
      pinHash: string;
      pinSalt: string;
      sessionVersion: number;
      source: "supabase";
    }
  | { status: "setup_required"; sessionVersion: number; source: "supabase" }
  | { status: "unconfigured"; message: string };

export type VerifyPinResult =
  | { ok: true; setupRequired: false; sessionVersion: number }
  | { ok: false; setupRequired: true; message: string }
  | { ok: false; setupRequired: false; message: string };

export type SetPinResult = { ok: true; sessionVersion: number } | { ok: false; message: string };

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
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
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function configuredPinSessionSecret(): string | null {
  const secret = process.env.HH_PIN_SESSION_SECRET?.trim() ?? "";
  if (secret) return secret;
  return isProductionRuntime() ? null : "hh-local-pin-session-secret";
}

function parseCookieHeader(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

function readCookieValue(request: CookieReader, name: string): string | null {
  const structured = request.cookies?.get(name)?.value;
  if (structured) return structured;
  return parseCookieHeader(request.headers?.get("cookie"), name);
}

async function hmacSha256Base64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encodeText(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(encodeText(value)));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function pbkdf2PinHash(pin: string, salt: string): Promise<string> {
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
      salt: toArrayBuffer(base64UrlToBytes(salt)),
      iterations: PIN_HASH_ITERATIONS,
    },
    keyMaterial,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function supabaseServiceConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function isMissingSettingsTableError(status: number, body: string): boolean {
  return (
    status === 404 ||
    body.includes("PGRST205") ||
    body.includes("42P01") ||
    /app_security_settings/i.test(body)
  );
}

async function fetchSupabasePinSettings(): Promise<PinSettings> {
  const config = supabaseServiceConfig();
  if (!config) {
    return {
      status: "unconfigured",
      message: "PIN settings require server Supabase service access.",
    };
  }

  const response = await fetch(
    `${config.url}/rest/v1/app_security_settings?key=eq.${encodeURIComponent(
      PIN_SETTINGS_KEY
    )}&select=pin_hash,pin_salt,session_version&limit=1`,
    {
      cache: "no-store",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: "application/json",
      },
    }
  ).catch((error: unknown) => {
    throw new Error(error instanceof Error ? error.message : "Failed to load PIN settings.");
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      status: "unconfigured",
      message: isMissingSettingsTableError(response.status, text)
        ? "PIN settings table is not available."
        : "PIN settings are not available.",
    };
  }

  const rows = JSON.parse(text || "[]") as Array<{
    pin_hash?: string | null;
    pin_salt?: string | null;
    session_version?: number | null;
  }>;
  const row = rows[0];
  if (!row) {
    return { status: "setup_required", sessionVersion: 1, source: "supabase" };
  }

  const sessionVersion =
    typeof row.session_version === "number" && Number.isFinite(row.session_version)
      ? row.session_version
      : 1;
  const pinHash = row.pin_hash?.trim() ?? "";
  const pinSalt = row.pin_salt?.trim() ?? "";

  if (!pinHash || !pinSalt) {
    return { status: "setup_required", sessionVersion, source: "supabase" };
  }

  return {
    status: "ready",
    pinHash,
    pinSalt,
    sessionVersion,
    source: "supabase",
  };
}

async function loadPinSettings(): Promise<PinSettings> {
  return fetchSupabasePinSettings();
}

async function upsertSupabasePinSettings(input: {
  pinHash: string;
  pinSalt: string;
  sessionVersion: number;
  updatedBy: string | null;
}): Promise<SetPinResult> {
  const config = supabaseServiceConfig();
  if (!config) {
    return { ok: false, message: "Server Supabase service access is not configured." };
  }

  const response = await fetch(`${config.url}/rest/v1/app_security_settings?on_conflict=key`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      key: PIN_SETTINGS_KEY,
      pin_hash: input.pinHash,
      pin_salt: input.pinSalt,
      session_version: input.sessionVersion,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy,
    }),
  }).catch((error: unknown) => {
    throw new Error(error instanceof Error ? error.message : "Failed to save PIN settings.");
  });

  if (!response.ok) {
    return { ok: false, message: "Failed to save PIN settings." };
  }

  return { ok: true, sessionVersion: input.sessionVersion };
}

export function isPinFormat(value: unknown): value is string {
  return typeof value === "string" && PIN_PATTERN.test(value);
}

export async function hashPinForStorage(
  pin: string,
  salt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)))
): Promise<{ hash: string; salt: string }> {
  if (!isPinFormat(pin)) {
    throw new Error("PIN must be 4 digits.");
  }
  return { hash: await pbkdf2PinHash(pin, salt), salt };
}

export async function getPinStatus(): Promise<{
  initialized: boolean;
  sessionVersion: number | null;
  source: "supabase" | "unconfigured";
}> {
  const settings = await loadPinSettings();
  if (settings.status === "ready") {
    return {
      initialized: true,
      sessionVersion: settings.sessionVersion,
      source: settings.source,
    };
  }
  if (settings.status === "setup_required") {
    return {
      initialized: false,
      sessionVersion: settings.sessionVersion,
      source: settings.source,
    };
  }
  return { initialized: false, sessionVersion: null, source: "unconfigured" };
}

export async function verifyPin(pin: string): Promise<VerifyPinResult> {
  if (!isPinFormat(pin)) {
    return { ok: false, setupRequired: false, message: "PIN must be 4 digits." };
  }

  const settings = await loadPinSettings();
  if (settings.status === "setup_required") {
    return { ok: false, setupRequired: true, message: "PIN setup required." };
  }
  if (settings.status === "unconfigured") {
    return { ok: false, setupRequired: false, message: settings.message };
  }

  const candidate = await pbkdf2PinHash(pin, settings.pinSalt);
  if (!safeEqual(candidate, settings.pinHash)) {
    return { ok: false, setupRequired: false, message: "Invalid PIN" };
  }
  return { ok: true, setupRequired: false, sessionVersion: settings.sessionVersion };
}

export async function setPin(
  newPin: string,
  updatedBy: string | null = null
): Promise<SetPinResult> {
  if (!isPinFormat(newPin)) {
    return { ok: false, message: "New PIN must be 4 digits." };
  }

  const current = await fetchSupabasePinSettings();
  if (current.status === "unconfigured") {
    return { ok: false, message: current.message };
  }

  const nextVersion = current.status === "ready" ? current.sessionVersion + 1 : 1;
  const { hash, salt } = await hashPinForStorage(newPin);
  return upsertSupabasePinSettings({
    pinHash: hash,
    pinSalt: salt,
    sessionVersion: nextVersion,
    updatedBy,
  });
}

export async function createPinSession(sessionVersion: number): Promise<string | null> {
  const secret = configuredPinSessionSecret();
  if (!secret) return null;
  if (!Number.isInteger(sessionVersion) || sessionVersion < 1) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload: PinSessionPayload = {
    v: 1,
    iat: now,
    exp: now + PIN_SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID(),
    sessionVersion,
  };
  const payloadBase64 = bytesToBase64Url(encodeText(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

export async function readPinSession(request: CookieReader): Promise<PinSessionPayload | null> {
  const value = readCookieValue(request, PIN_SESSION_COOKIE);
  if (!value) return null;

  const secret = configuredPinSessionSecret();
  if (!secret) return null;

  const [payloadBase64, signature] = value.split(".");
  if (!payloadBase64 || !signature) return null;

  const expected = await hmacSha256Base64Url(payloadBase64, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadBase64))) as
      | PinSessionPayload
      | undefined;
    if (!payload || payload.v !== 1 || typeof payload.exp !== "number") return null;
    if (!Number.isInteger(payload.sessionVersion) || payload.sessionVersion < 1) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isValidPinSession(request: CookieReader): Promise<boolean> {
  const session = await readPinSession(request);
  if (!session) return false;

  const settings = await loadPinSettings();
  if (settings.status !== "ready") return false;
  return session.sessionVersion === settings.sessionVersion;
}

export function setPinSessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(PIN_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: PIN_SESSION_MAX_AGE_SECONDS,
  });
}

export function clearPinSession(response: NextResponse): void {
  response.cookies.set(PIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
