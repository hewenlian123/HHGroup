export const DEVICE_UNLOCK_COOKIE = "hh_device_unlock";
export const TRUSTED_DEVICE_COOKIE = "hh_trusted_device";

export type DeviceUnlockPayload = {
  v: 1;
  userId: string;
  sessionId: string;
  pinVersion: number;
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
    process.env.HH_DEVICE_UNLOCK_SECRET?.trim() || process.env.HH_PIN_SESSION_SECRET?.trim() || "";
  if (configured) return configured;
  return isProductionRuntime() ? null : "hh-local-device-unlock-secret";
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

export async function createSignedDeviceToken(payload: DeviceUnlockPayload): Promise<string> {
  const secret = signingSecret();
  if (!secret) return "";
  const encoded = bytesToBase64Url(encodeText(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function readSignedDeviceToken(
  value: string | null | undefined
): Promise<DeviceUnlockPayload | null> {
  if (!value) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  if (!safeEqual(signature, await hmac(encoded, secret))) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    ) as DeviceUnlockPayload;
    if (
      payload.v !== 1 ||
      !payload.userId ||
      !payload.sessionId ||
      !Number.isInteger(payload.pinVersion) ||
      payload.pinVersion < 1 ||
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

export function readDeviceCookie(request: CookieReader, name: string): string | null {
  const structured = request.cookies?.get(name)?.value;
  return structured ?? parseCookieHeader(request.headers?.get("cookie"), name);
}

export function sessionIdFromAccessToken(accessToken: string): string | null {
  const payloadPart = accessToken.split(".")[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as {
      session_id?: unknown;
    };
    return typeof payload.session_id === "string" && payload.session_id ? payload.session_id : null;
  } catch {
    return null;
  }
}
