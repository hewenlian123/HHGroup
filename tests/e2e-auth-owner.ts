import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type E2EAuthRole = "owner" | "assistant";

function localServerSecret(): string | null {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
  );
}

function localE2EAuthCredentials(role: E2EAuthRole): {
  email: string;
  password: string;
} {
  const configuredEmail = role === "owner" ? process.env.E2E_AUTH_OWNER_EMAIL?.trim() : undefined;
  const configuredPassword =
    role === "owner" ? process.env.E2E_AUTH_OWNER_PASSWORD?.trim() : undefined;
  if (configuredEmail && configuredPassword) {
    return { email: configuredEmail, password: configuredPassword };
  }

  const serverSecret = localServerSecret();
  if (!serverSecret) {
    throw new Error(
      "Local authenticated E2E requires configured owner credentials or a local server secret."
    );
  }
  const digest = createHash("sha256")
    .update(`hh-local-e2e-auth:${role}:${serverSecret}`)
    .digest("hex");
  return {
    email: `e2e-auth-${role}-${digest.slice(0, 16)}@example.invalid`,
    password: `Hh!${digest.slice(16, 44)}aA1`,
  };
}

function localAuthAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serverSecret = localServerSecret();
  if (!url || !serverSecret) {
    throw new Error(
      "Local authenticated E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY fallback)."
    );
  }
  const parsed = new URL(url);
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Authenticated E2E owner lifecycle is local-Docker only.");
  }
  return createClient(url, serverSecret, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function ensureE2EUser(
  role: E2EAuthRole,
  options: { resetExisting?: boolean } = {}
): Promise<{ email: string; password: string; userId: string }> {
  const { email, password } = localE2EAuthCredentials(role);
  const admin = localAuthAdmin();
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw new Error("Unable to inspect the local E2E Auth owner.");

  const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    if (options.resetExisting) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { role },
        email_confirm: true,
        password,
      });
      if (error) throw new Error("Unable to reset the local E2E Auth owner.");
    }
    return { email, password, userId: existing.id };
  }

  const { data, error } = await admin.auth.admin.createUser({
    app_metadata: { role },
    email,
    email_confirm: true,
    password,
    user_metadata: { display_name: `E2E Auth ${role}` },
  });
  if (error || !data.user) {
    throw new Error("Unable to create the local E2E Auth owner.");
  }
  return { email, password, userId: data.user.id };
}

export async function provisionE2EAuthUsersForRun(): Promise<void> {
  await ensureE2EUser("owner", { resetExisting: true });
  await ensureE2EUser("assistant", { resetExisting: true });
}

export async function resetE2EOwnerPassword(): Promise<void> {
  await ensureE2EUser("owner", { resetExisting: true });
}

export async function ensureE2EOwner(): Promise<string> {
  return (await ensureE2EUser("owner")).userId;
}

export async function getE2EOwnerCredentials(): Promise<{
  email: string;
  password: string;
}> {
  await ensureE2EUser("owner");
  return localE2EAuthCredentials("owner");
}

export async function deleteE2EAuthUsers(): Promise<void> {
  const admin = localAuthAdmin();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return;
  for (const user of data.users) {
    const displayName = String(user.user_metadata?.display_name ?? "").toLowerCase();
    if (displayName === "e2e auth owner" || displayName === "e2e auth assistant") {
      await admin.auth.admin.deleteUser(user.id, false);
    }
  }
}

export async function deleteE2EOwner(): Promise<void> {
  await deleteE2EAuthUsers();
}

export async function deleteE2EAssistant(): Promise<void> {
  const admin = localAuthAdmin();
  const { email } = localE2EAuthCredentials("assistant");
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return;
  const assistant = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (assistant) {
    await admin.auth.admin.deleteUser(assistant.id, false);
  }
}

export async function loginAsE2EOwner(page: Page, destination = "/dashboard"): Promise<void> {
  const baseURL = (process.env.E2E_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
  await addE2EOwnerSession(page.context(), baseURL);
  await gotoWithE2EAuth(page, destination);
}

function e2eBaseURL(): string {
  return process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
}

function destinationMatches(actual: URL, expected: URL): boolean {
  return actual.href === expected.href;
}

async function waitForSuccessfulAuthResponse(
  page: Page
): Promise<Awaited<ReturnType<Page["waitForResponse"]>>> {
  const authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321")
    .origin;
  const response = await page.waitForResponse(
    (candidate) => {
      const candidateURL = new URL(candidate.url());
      return candidateURL.origin === authOrigin && candidateURL.pathname === "/auth/v1/user";
    },
    { timeout: 60_000 }
  );
  if (!response.ok()) {
    throw new Error(
      `Authenticated E2E navigation received ${response.status()} ${response.statusText()} from ${response.url()}.`
    );
  }
  return response;
}

async function finishE2EAuthNavigation(
  page: Page,
  destination: string,
  navigate: () => Promise<unknown>
): Promise<void> {
  const expectedDestination = new URL(destination, e2eBaseURL());
  const authResponse = waitForSuccessfulAuthResponse(page);
  await Promise.all([authResponse, navigate()]);
  await page.waitForURL((url) => destinationMatches(url, expectedDestination), { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

async function drainCurrentPage(page: Page): Promise<void> {
  if (/^https?:\/\//i.test(page.url())) {
    await page.waitForLoadState("networkidle");
  }
}

export async function gotoWithE2EAuth(page: Page, destination: string): Promise<void> {
  await drainCurrentPage(page);
  await finishE2EAuthNavigation(page, destination, () =>
    page.goto(destination, { waitUntil: "domcontentloaded" })
  );
}

export async function reloadWithE2EAuth(page: Page): Promise<void> {
  const destination = page.url();
  await drainCurrentPage(page);
  await finishE2EAuthNavigation(page, destination, () =>
    page.reload({ waitUntil: "domcontentloaded" })
  );
}

export async function addE2EOwnerSession(context: BrowserContext, baseURL: string): Promise<void> {
  await addE2ESession(context, baseURL, "owner");
}

async function addE2ESession(
  context: BrowserContext,
  baseURL: string,
  role: E2EAuthRole
): Promise<void> {
  const { email, password } = await ensureE2EUser(role);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Local Supabase Auth is not configured.");

  let cookieJar: Array<{
    name: string;
    value: string;
    options?: {
      httpOnly?: boolean;
      maxAge?: number;
      sameSite?: boolean | "lax" | "strict" | "none";
      secure?: boolean;
    };
  }> = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieJar,
      setAll: (next) => {
        cookieJar = next;
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Unable to create the local ${role} Auth session.`);

  await context.addCookies(
    cookieJar.map(({ name, value, options }) => ({
      httpOnly: options?.httpOnly,
      name,
      sameSite:
        options?.sameSite === "strict"
          ? ("Strict" as const)
          : options?.sameSite === "none"
            ? ("None" as const)
            : ("Lax" as const),
      secure: options?.secure,
      url: baseURL,
      value,
    }))
  );
}

export async function addE2EAssistantSession(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  await addE2ESession(context, baseURL, "assistant");
}
