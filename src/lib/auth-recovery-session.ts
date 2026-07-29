import "server-only";

import type { NextResponse } from "next/server";

export const RECOVERY_SESSION_COOKIE = "hh_recovery_session";

const RECOVERY_SESSION_TTL_SECONDS = 30 * 60;

type RecoverySessionPayload = {
  v: 1;
  userId: string;
  sessionId: string;
  exp: number;
};

type CookieReader = {
  cookies?: {
    get(name: string): { value?: string } | undefined;
  };
  headers?: Headers;
};

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function signingSecret(): string | null {
  const configured =
    process.env.HH_PIN_SESSION_SECRET?.trim() || process.env.HH_DEVICE_UNLOCK_SECRET?.trim() || "";
  if (configured) return configured;
  return isProductionRuntime() ? null : "hh-local-recovery-session-secret";
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

async function hmac(value: string, secret: string): Promise<string> {
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

export async function createRecoverySessionToken(input: {
  userId: string;
  sessionId: string;
}): Promise<string> {
  const secret = signingSecret();
  if (!secret || !input.userId || !input.sessionId) return "";
  const payload: RecoverySessionPayload = {
    v: 1,
    userId: input.userId,
    sessionId: input.sessionId,
    exp: Math.floor(Date.now() / 1000) + RECOVERY_SESSION_TTL_SECONDS,
  };
  const encoded = bytesToBase64Url(encodeText(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function readRecoverySessionToken(
  value: string | null | undefined
): Promise<RecoverySessionPayload | null> {
  if (!value) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !safeEqual(signature, await hmac(encoded, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    ) as RecoverySessionPayload;
    if (
      payload.v !== 1 ||
      !payload.userId ||
      !payload.sessionId ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookieHeader(value: string | null | undefined, name: string): string | null {
  if (!value) return null;
  for (const part of value.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function readRecoverySessionCookie(request: CookieReader): string | null {
  const structured = request.cookies?.get(RECOVERY_SESSION_COOKIE)?.value;
  return structured ?? parseCookieHeader(request.headers?.get("cookie"), RECOVERY_SESSION_COOKIE);
}

export function setRecoverySessionCookie(response: NextResponse, value: string): void {
  response.cookies.set(RECOVERY_SESSION_COOKIE, value, {
    httpOnly: true,
    maxAge: RECOVERY_SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: isProductionRuntime(),
  });
}

export function clearRecoverySessionCookie(response: NextResponse): void {
  response.cookies.set(RECOVERY_SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: isProductionRuntime(),
  });
}
