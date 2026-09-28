import { expect, test as base } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

export const UI_READONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const test = base.extend<{ uiReadonlyNetwork: void }>({
  uiReadonlyNetwork: [
    async ({ page }, use) => {
      const certification = process.env.E2E_UI_CERTIFICATION === "1";
      const violations: string[] = [];
      if (certification) {
        const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const expectedApiUrl = process.env.HH_CERTIFICATION_PROXY_URL!;
        const api = new URL(apiUrl);
        expect(api.origin, "Auth target matches the explicit certification target").toBe(
          new URL(expectedApiUrl).origin
        );
        expect(["127.0.0.1", "localhost"]).toContain(api.hostname);
        expect(Number(api.port)).toBeGreaterThanOrEqual(57000);
        expect(Number(api.port)).toBeLessThanOrEqual(57999);
        expect(process.env.HH_CERTIFICATION_PROJECT_ID).toMatch(/^hh-t8-cert-/);

        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const email = process.env.E2E_UI_SESSION_EMAIL!;
        const password = process.env.E2E_UI_SESSION_PASSWORD!;
        let cookies: Array<{
          name: string;
          value: string;
          options?: {
            httpOnly?: boolean;
            sameSite?: boolean | "lax" | "strict" | "none";
            secure?: boolean;
          };
        }> = [];
        const client = createServerClient(apiUrl, anonKey, {
          cookies: {
            getAll: () => cookies,
            setAll: (next) => {
              cookies = next;
            },
          },
        });
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        expect(error, "independent disposable Auth session").toBeNull();
        expect(data.user?.id).toBe(process.env.E2E_UI_AUTH_USER_ID);
        expect(data.session?.access_token, "disposable bearer token").toBeTruthy();
        await page.context().setExtraHTTPHeaders({
          Authorization: `Bearer ${data.session!.access_token}`,
        });
        await page.context().clearCookies();
        await page.context().addCookies(
          cookies.map(({ name, value, options }) => ({
            httpOnly: options?.httpOnly,
            name,
            sameSite:
              options?.sameSite === "strict"
                ? ("Strict" as const)
                : options?.sameSite === "none"
                  ? ("None" as const)
                  : ("Lax" as const),
            secure: options?.secure,
            url: process.env.E2E_BASE_URL!,
            value,
          }))
        );
      }

      page.on("requestfailed", (request) => {
        if (!certification) return;
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith("/auth/v1/") || pathname === "/api/auth/local-auto-login") {
          violations.push(`${request.failure()?.errorText ?? "request failed"} ${request.url()}`);
        }
      });
      await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (certification) {
          const appOrigin = new URL(process.env.E2E_BASE_URL!).origin;
          const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
          if (![appOrigin, supabaseOrigin].includes(url.origin)) {
            violations.push(request.url());
            await route.abort("blockedbyclient");
            return;
          }
          if (url.pathname === "/api/auth/local-auto-login") {
            violations.push(request.url());
            await route.abort("blockedbyclient");
            return;
          }
          if (
            url.origin === appOrigin &&
            url.pathname === "/api/system-health" &&
            request.method() === "GET"
          ) {
            await route.fulfill({ status: 200, json: { status: "ok" } });
            return;
          }
          if (
            url.origin === supabaseOrigin &&
            url.pathname === "/auth/v1/user" &&
            request.method() === "GET"
          ) {
            const userId = process.env.E2E_UI_AUTH_USER_ID;
            const userJson = process.env.E2E_UI_AUTH_USER_JSON;
            if (!userId || !userJson || !request.headers().authorization?.startsWith("Bearer ")) {
              violations.push(request.url());
              await route.abort("blockedbyclient");
              return;
            }
            await route.fulfill({
              status: 200,
              json: JSON.parse(userJson),
            });
            return;
          }
          if (
            url.pathname.startsWith("/auth/v1/") &&
            !(
              url.origin === supabaseOrigin &&
              url.pathname === "/auth/v1/user" &&
              request.method() === "GET"
            )
          ) {
            violations.push(request.url());
            await route.abort("blockedbyclient");
            return;
          }
        }
        if (UI_READONLY_METHODS.has(request.method())) {
          await route.continue();
          return;
        }

        if (certification) violations.push(`${request.method()} ${request.url()}`);
        await route.abort("blockedbyclient");
      });

      await use();
      if (certification)
        expect(violations, "unexpected readonly/auth/network requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
