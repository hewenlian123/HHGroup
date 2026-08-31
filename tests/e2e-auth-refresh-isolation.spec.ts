import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

import { addE2EOwnerSession } from "./e2e-auth-owner";

type BrowserError = {
  page: "A" | "B";
  source: "console" | "pageerror";
  text: string;
};

function captureBrowserErrors(page: Page, label: BrowserError["page"], errors: BrowserError[]) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ page: label, source: "console", text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    errors.push({ page: label, source: "pageerror", text: error.message });
  });
}

async function refreshContextSession(context: BrowserContext, baseURL: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Local Supabase Auth is not configured.");

  let cookieJar = (await context.cookies(baseURL)).map(({ name, value }) => ({ name, value }));
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieJar,
      setAll: (next) => {
        cookieJar = next.map(({ name, value }) => ({ name, value }));
      },
    },
  });
  const current = await supabase.auth.getSession();
  expect(current.error).toBeNull();
  expect(current.data.session).not.toBeNull();

  const refreshed = await supabase.auth.refreshSession(current.data.session ?? undefined);
  expect(refreshed.error).toBeNull();
  expect(refreshed.data.session).not.toBeNull();

  await context.addCookies(cookieJar.map(({ name, value }) => ({ name, url: baseURL, value })));
}

test("a second owner context does not revoke the first owner context", async ({
  baseURL,
  browser,
}) => {
  const localBaseURL = (baseURL || "http://localhost:3000").replace(/\/$/, "");
  const browserErrors: BrowserError[] = [];
  const contextA = await browser.newContext({ baseURL: localBaseURL });
  const contextB = await browser.newContext({ baseURL: localBaseURL });

  try {
    await addE2EOwnerSession(contextA, localBaseURL);
    const pageA = await contextA.newPage();
    captureBrowserErrors(pageA, "A", browserErrors);
    await pageA.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(pageA).toHaveURL(/\/dashboard$/);

    await addE2EOwnerSession(contextB, localBaseURL);
    const pageB = await contextB.newPage();
    captureBrowserErrors(pageB, "B", browserErrors);
    await pageB.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(pageB).toHaveURL(/\/dashboard$/);

    await refreshContextSession(contextA, localBaseURL);
    await refreshContextSession(contextB, localBaseURL);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await expect(pageA).toHaveURL(/\/dashboard$/);

    expect(browserErrors).toEqual([]);
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
