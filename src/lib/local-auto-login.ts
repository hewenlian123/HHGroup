export const LOCAL_AUTO_LOGIN_PATH = "/api/auth/local-auto-login";

export type LocalAutoLoginOptions = {
  flag?: string;
  nodeEnv?: string;
  requestUrl: string;
  supabaseUrl?: string;
  vercelEnv?: string;
};

export type LocalAutoLoginAvailability =
  | { enabled: true }
  | {
      enabled: false;
      reason:
        | "disabled"
        | "deployed-runtime"
        | "non-development-runtime"
        | "non-local-request"
        | "non-local-supabase";
    };

function enabledFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isLocalHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The local owner bootstrap is deliberately narrower than ordinary development:
 * an explicit flag, Next development runtime, loopback request, and loopback
 * Supabase are all mandatory. No client-controlled header can enable it.
 */
export function resolveLocalAutoLoginAvailability(
  options: LocalAutoLoginOptions
): LocalAutoLoginAvailability {
  if (!enabledFlag(options.flag)) return { enabled: false, reason: "disabled" };

  const vercelEnv = options.vercelEnv?.trim().toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview") {
    return { enabled: false, reason: "deployed-runtime" };
  }

  if (options.nodeEnv?.trim().toLowerCase() !== "development") {
    return { enabled: false, reason: "non-development-runtime" };
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(options.requestUrl);
  } catch {
    return { enabled: false, reason: "non-local-request" };
  }
  if (requestUrl.protocol !== "http:" || !isLoopbackHostname(requestUrl.hostname)) {
    return { enabled: false, reason: "non-local-request" };
  }

  if (!isLocalHttpUrl(options.supabaseUrl)) {
    return { enabled: false, reason: "non-local-supabase" };
  }

  return { enabled: true };
}

export function isLocalAutoLoginEnabled(requestUrl: string): boolean {
  return resolveLocalAutoLoginAvailability({
    flag: process.env.HH_ALLOW_LOCAL_AUTO_LOGIN,
    nodeEnv: process.env.NODE_ENV,
    requestUrl,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    vercelEnv: process.env.VERCEL_ENV,
  }).enabled;
}
