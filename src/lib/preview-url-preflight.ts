/**
 * Browser-side check that a preview URL is reachable (CORS permitting).
 * Used before showing receipt images; falls back from any rejected HEAD to a
 * tiny ranged GET. Supabase's signed-object endpoint may return HTTP 400 for
 * HEAD even when the corresponding authenticated GET is valid.
 */
export type PreviewUrlPreflightResult = {
  ok: boolean;
  status?: number;
  method: string;
  error?: string;
};

export async function preflightPreviewUrl(url: string): Promise<PreviewUrlPreflightResult> {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return { ok: false, method: "none", error: "empty_url" };
  // Supabase's signed-object endpoint rejects HEAD and ranged GET requests in
  // some Storage versions even though a normal image GET succeeds. The URL was
  // issued by the authenticated server route, so let the real image request
  // validate it and avoid downloading the receipt twice.
  if (trimmed.includes("/storage/v1/object/sign/")) {
    return { ok: true, method: "signed-object" };
  }

  try {
    let res = await fetch(trimmed, {
      method: "HEAD",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    let method = "HEAD";
    if (!res.ok) {
      res = await fetch(trimmed, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
      method = "GET Range";
    }
    if (res.type === "opaque" || res.type === "opaqueredirect") {
      return { ok: true, status: undefined, method, error: "opaque_response" };
    }
    if (res.ok) return { ok: true, status: res.status, method };
    if (res.status === 206) return { ok: true, status: res.status, method };
    return { ok: false, status: res.status, method };
  } catch (e) {
    return {
      ok: false,
      method: "fetch",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function classifyStorageUrlPrefix(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "(empty)";
  if (u.includes("/object/sign/")) return "/object/sign/";
  if (u.includes("/object/public/")) return "/object/public/";
  if (u.startsWith("blob:")) return "blob:";
  if (u.startsWith("data:")) return "data:";
  return "other";
}
