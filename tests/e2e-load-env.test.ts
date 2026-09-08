import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadE2EProcessEnv } from "./e2e-load-env";

test("explicit certification target survives dotenv files", () => {
  const dir = mkdtempSync(join(tmpdir(), "hh-e2e-env-"));
  const explicit = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:57321",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    SUPABASE_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "disposable-status-key",
  };
  const previous = Object.fromEntries(Object.keys(explicit).map((key) => [key, process.env[key]]));
  try {
    const conflicting = Object.keys(explicit)
      .map((key) => `${key}=not-the-explicit-certification-value`)
      .join("\n");
    writeFileSync(join(dir, ".env.local"), `${conflicting}\n`);
    writeFileSync(join(dir, ".env.test"), `${conflicting}\n`);
    Object.assign(process.env, explicit);
    loadE2EProcessEnv(dir);
    for (const [key, value] of Object.entries(explicit)) assert.equal(process.env[key], value);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
