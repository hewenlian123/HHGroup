export function normalizeAuthRedirect(value: string | string[] | null | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/dashboard";

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/dashboard";
  if (decoded.startsWith("/login") || decoded.startsWith("/auth/callback")) return "/dashboard";
  return decoded;
}
