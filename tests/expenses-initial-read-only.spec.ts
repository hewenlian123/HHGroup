import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { isLocalE2eTarget } from "./e2e-env-helpers";

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function categoryState(client: SupabaseClient) {
  const [canonical, legacy] = await Promise.all([
    client
      .from("expense_options")
      .select("id,key,name,active,is_default,is_system,sort_order")
      .eq("type", "category")
      .order("id"),
    client.from("categories").select("id,name,status").eq("type", "expense").order("id"),
  ]);
  if (canonical.error) throw new Error(canonical.error.message);
  if (legacy.error) throw new Error(legacy.error.message);
  return {
    canonical: canonical.data ?? [],
    legacy: legacy.data ?? [],
  };
}

test("Expenses initial page load is read-only for category authorities", async ({ page }) => {
  test.skip(!isLocalE2eTarget(), "Expenses read-only verification is local-only.");
  const admin = adminClient();
  test.skip(!admin, "Local Supabase service role is required.");

  const writes: string[] = [];
  const serverErrors: string[] = [];
  page.on("request", (request) => {
    const method = request.method();
    const url = request.url();
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      /\/rest\/v1\/(expense_options|categories)(?:\?|$)/.test(url)
    ) {
      writes.push(`${method} ${url}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  const before = await categoryState(admin!);
  const documentResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().resourceType() === "document" && url.pathname === "/financial/expenses";
  });
  await loginAsE2EOwner(page, "/financial/expenses");
  expect((await documentResponsePromise).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  const after = await categoryState(admin!);

  expect(after).toEqual(before);
  expect(writes).toEqual([]);
  expect(serverErrors).toEqual([]);
});
