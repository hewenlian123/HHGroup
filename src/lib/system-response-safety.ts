import type { SystemLogEntry } from "@/lib/system-log-store";

const SECRET_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DATABASE_URL",
  "DATABASE_URL",
  "HH_INTERNAL_ADMIN_SECRET",
  "INTERNAL_ADMIN_SECRET",
  "HH_PIN_SESSION_SECRET",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function configuredSecretValues(): string[] {
  return SECRET_ENV_KEYS.map((key) => process.env[key]?.trim() ?? "").filter(
    (value) => value.length >= 8
  );
}

export function redactSensitiveText(value: unknown): string {
  let text = typeof value === "string" ? value : String(value ?? "");

  for (const secret of configuredSecretValues()) {
    text = text.split(secret).join("[redacted]");
  }

  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`<>)]+/gi, "[redacted-db-url]")
    .replace(
      /(service[_ -]?role|internal[_ -]?admin[_ -]?secret|db[_ -]?url)\s*[:=]\s*[^\s"'`<>)]+/gi,
      "$1=[redacted]"
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
      "[redacted-token]"
    );
}

export function sanitizeSystemLogEntry(entry: SystemLogEntry): SystemLogEntry {
  return {
    time: redactSensitiveText(entry.time),
    module: redactSensitiveText(entry.module),
    type: entry.type,
    message: redactSensitiveText(entry.message),
  };
}

export function safeErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof Error) return redactSensitiveText(error.message || fallback);
  if (typeof error === "string") return redactSensitiveText(error);
  return fallback;
}
