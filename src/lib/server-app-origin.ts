import "server-only";

/**
 * Resolve the app origin for server-side navigation (PDF capture, webhooks).
 * Prefers the incoming request host; falls back to env or local dev.
 */
export function resolveServerAppOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto")?.trim() ||
      (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : "");
  if (envUrl) return envUrl.replace(/\/$/, "");

  return "http://localhost:3000";
}
