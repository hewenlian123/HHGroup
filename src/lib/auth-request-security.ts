export type SameOriginValidation =
  | { ok: true }
  | { ok: false; status: 403; message: "Cross-site request rejected." };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

    if (forwardedHost) {
      const protocol =
        forwardedProto === "http" || forwardedProto === "https"
          ? forwardedProto
          : url.protocol.slice(0, -1);
      return `${protocol}://${forwardedHost}`;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function validateSameOriginMutation(request: Request): SameOriginValidation {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    return { ok: false, status: 403, message: "Cross-site request rejected." };
  }

  const expectedOrigin = requestOrigin(request);
  const suppliedOrigin = request.headers.get("origin")?.trim();
  if (!expectedOrigin) {
    return { ok: false, status: 403, message: "Cross-site request rejected." };
  }

  if (suppliedOrigin) {
    try {
      if (new URL(suppliedOrigin).origin !== expectedOrigin) {
        return { ok: false, status: 403, message: "Cross-site request rejected." };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 403, message: "Cross-site request rejected." };
    }
  }

  if (fetchSite === "same-origin" || fetchSite === "none") return { ok: true };
  return { ok: false, status: 403, message: "Cross-site request rejected." };
}
