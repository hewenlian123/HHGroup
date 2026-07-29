import "server-only";

export type TrustedAuthAppOrigin = {
  origin: string;
  requestMatches: boolean;
};

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function exactOrigin(value: string, defaultProtocol = "https:"): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `${defaultProtocol}//${trimmed}`);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function incomingOrigin(request: Request): string | null {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  if (!host) {
    return exactOrigin(new URL(request.url).origin);
  }

  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? `${forwardedProto}:`
      : host.includes("localhost") || host.startsWith("127.0.0.1")
        ? "http:"
        : "https:";
  return exactOrigin(host, protocol);
}

function configuredOrigin(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return exactOrigin(explicit);

  if (process.env.VERCEL_ENV === "preview") {
    const deploymentHost = process.env.VERCEL_URL?.trim();
    return deploymentHost ? exactOrigin(deploymentHost) : null;
  }

  return null;
}

/**
 * Resolves the only origin allowed to initiate and consume an Auth PKCE flow.
 *
 * Production requires the server-only APP_URL. Vercel Preview uses the
 * deployment-specific VERCEL_URL, never a request-controlled branch alias.
 * Local development falls back to the incoming origin.
 */
export function resolveTrustedAuthAppOrigin(request: Request): TrustedAuthAppOrigin | null {
  const incoming = incomingOrigin(request);
  const configured = configuredOrigin();

  if (configured) {
    return {
      origin: configured,
      requestMatches: incoming === configured,
    };
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return null;
  }

  if (!incoming) return null;
  return {
    origin: incoming,
    requestMatches: true,
  };
}
