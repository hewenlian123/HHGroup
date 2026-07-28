import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type E2EAuthRole = "owner" | "assistant";

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

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRole) {
    throw new Error(
      "Local authenticated E2E requires configured owner credentials or the local service-role key."
    );
  }
  const digest = createHash("sha256")
    .update(`hh-local-e2e-auth:${role}:${serviceRole}`)
    .digest("hex");
  return {
    email: `e2e-auth-${role}-${digest.slice(0, 16)}@example.invalid`,
    password: `Hh!${digest.slice(16, 44)}aA1`,
  };
}

function localAuthAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    throw new Error(
      "Local authenticated E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  const parsed = new URL(url);
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Authenticated E2E owner lifecycle is local-Docker only.");
  }
  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function ensureE2EUser(
  role: E2EAuthRole
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
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { role },
      email_confirm: true,
      password,
    });
    if (error) throw new Error("Unable to reset the local E2E Auth owner.");
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
  await ensureE2EOwner();
  const { email, password } = localE2EAuthCredentials("owner");
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === destination, { timeout: 60_000 });
}

export async function addE2EAssistantSession(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  const { email, password } = await ensureE2EUser("assistant");
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
  if (error) throw new Error("Unable to create the local assistant Auth session.");

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
