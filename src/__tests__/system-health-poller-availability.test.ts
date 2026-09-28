import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/system-health-context", () => ({ useSystemHealth: vi.fn() }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it("does not cache failed or malformed health responses as healthy and permits recovery", async () => {
  for (const response of [
    new Response('{"status":"ok"}', { status: 503 }),
    new Response("{}"),
    new Response("invalid JSON"),
  ]) {
    vi.resetModules();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response('{"status":"warning"}'));
    vi.stubGlobal("fetch", fetch);
    const { fetchSystemHealthStatus } =
      await import("@/components/system-health/system-health-poller");
    await expect(fetchSystemHealthStatus()).rejects.toThrow();
    await expect(fetchSystemHealthStatus()).resolves.toBe("warning");
    expect(fetch).toHaveBeenCalledTimes(2);
  }
});
