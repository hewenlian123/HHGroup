import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = process.cwd();
const MIGRATIONS_DIR = join(PROJECT_ROOT, "supabase", "migrations");

function authMigrationSql(): string {
  const filename = readdirSync(MIGRATIONS_DIR).find((entry) =>
    entry.endsWith("_authenticated_owner_access.sql")
  );
  expect(filename, "authenticated owner-access migration").toBeTruthy();
  return filename ? readFileSync(join(MIGRATIONS_DIR, filename), "utf8") : "";
}

describe("authenticated owner-access migration contract", () => {
  it("repairs role projection without granting the first user owner access", () => {
    const sql = authMigrationSql();

    expect(sql).toMatch(/create table if not exists public\.profiles/i);
    expect(sql).toMatch(/create table if not exists public\.role_permissions/i);
    expect(sql).toContain("app_user_security_settings");
    expect(sql).toContain("security_audit_events");
    expect(sql).toMatch(
      /coalesce\s*\(\s*new\.raw_app_meta_data\s*->>\s*'role'\s*,\s*'assistant'\s*\)/i
    );
    expect(sql).not.toMatch(/first.*owner/i);
    expect(sql).not.toMatch(/not exists\s*\(\s*select 1 from public\.profiles\s*\)/i);
  });

  it("keeps security settings service-role only and revokes anonymous attachment writes", () => {
    const sql = authMigrationSql();

    expect(sql).toMatch(/revoke all on table public\.app_user_security_settings from anon/i);
    expect(sql).toMatch(/revoke all on table public\.security_audit_events from anon/i);
    expect(sql).toMatch(
      /revoke insert\s*,\s*update\s*,\s*delete on table public\.attachments from anon/i
    );
    expect(sql).toMatch(/grant select on table public\.attachments to anon/i);
    expect(sql).not.toMatch(/delete\s+from\s+(storage\.objects|public\.expenses)/i);
  });

  it("disables the legacy global PIN without rewriting business or receipt data", () => {
    const sql = authMigrationSql();

    expect(sql).toMatch(/update public\.app_security_settings/i);
    expect(sql).toMatch(/pin_hash\s*=\s*null/i);
    expect(sql).toMatch(/pin_salt\s*=\s*null/i);
    expect(sql).toMatch(/session_version\s*=\s*session_version\s*\+\s*1/i);
    expect(sql).not.toMatch(/update\s+public\.expenses/i);
    expect(sql).not.toMatch(/update\s+public\.attachments/i);
  });

  it("locks down local Supabase Auth configuration", () => {
    const config = readFileSync(join(PROJECT_ROOT, "supabase", "config.toml"), "utf8");

    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup\s*=\s*false/i);
    expect(config).toMatch(/\[auth\][\s\S]*?minimum_password_length\s*=\s*12/i);
    expect(config).toMatch(
      /\[auth\][\s\S]*?password_requirements\s*=\s*"lower_upper_letters_digits_symbols"/i
    );
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/i);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?secure_password_change\s*=\s*true/i);
    expect(config).toContain("http://127.0.0.1:3104/auth/callback");
    expect(config).toContain("http://localhost:3104/auth/callback");
    expect(config).toContain("http://127.0.0.1:3104/auth/recovery/callback");
    expect(config).toContain("http://localhost:3104/auth/recovery/callback");
    expect(config).toContain("http://127.0.0.1:3104/reset-password");
    expect(config).toContain("http://localhost:3104/reset-password");
  });

  it("uses a prefetch-safe recovery OTP template without putting a secret in the link", () => {
    const config = readFileSync(join(PROJECT_ROOT, "supabase", "config.toml"), "utf8");
    const template = readFileSync(
      join(PROJECT_ROOT, "supabase", "templates", "recovery.html"),
      "utf8"
    );

    expect(config).toMatch(
      /\[auth\.email\.template\.recovery\][\s\S]*?subject\s*=\s*"Reset Your Password"[\s\S]*?content_path\s*=\s*"\.\/supabase\/templates\/recovery\.html"/i
    );
    expect(config).toMatch(/\[auth\.email\][\s\S]*?otp_expiry\s*=\s*3600/i);
    expect(template).toContain('href="{{ .RedirectTo }}"');
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    expect(template).not.toContain("{{ .TokenHash }}");
    expect(template).not.toMatch(/access_token|refresh_token|localhost|\*/i);
  });

  it("requires exact production and preview recovery callback allowlist entries", () => {
    const runbook = readFileSync(
      join(PROJECT_ROOT, "docs", "AUTH_RECEIPT_PRODUCTION_ROLLOUT.md"),
      "utf8"
    );

    expect(runbook).toContain("<canonical-production-origin>/auth/recovery/callback");
    expect(runbook).toContain("https://<exact-vercel-verification-host>/auth/recovery/callback");
    expect(runbook).toContain("server-only `APP_URL`");
    expect(runbook).toContain("deployment-specific `VERCEL_URL`");
    expect(runbook).toContain("Recovery OTP");
    expect(runbook).toContain("{{ .RedirectTo }}");
    expect(runbook).toContain("{{ .Token }}");
    expect(runbook).toContain("verifyOtp");
    expect(runbook).toContain("3,600 seconds");
    expect(runbook).not.toMatch(/same browser\s+profile/);
    expect(runbook).not.toContain("*/auth/recovery/callback");
  });
});
