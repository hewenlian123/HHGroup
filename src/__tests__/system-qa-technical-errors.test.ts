import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as responseSafety from "@/lib/system-response-safety";

// Exercise the route's real page scanner without running the full multi-route scan.
const compiledRoute = ts.transpileModule(
  readFileSync(resolve("src/app/api/system/qa-check/route.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;
const checkPageTarget = new Function(
  "require",
  "exports",
  `${compiledRoute}\nreturn checkPageTarget;`
)((name: string) => {
  if (name === "@/lib/system-response-safety") return responseSafety;
  return {};
}, {}) as (
  origin: string,
  headers: Headers,
  target: { id: string; name: string; path: string }
) => Promise<{ status: string; diagnosticCode: string; message: string }>;

async function scan(html: string, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html, { status })));
  return checkPageTarget("http://localhost:3001", new Headers(), {
    id: "system-health",
    name: "System Health",
    path: "/system-health",
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("System QA visible technical errors", () => {
  it("does not flag its own production auth/RLS explanation", async () => {
    const result = await scan(`<h2>System QA</h2><p>
      Safe self-check for page availability, auth/RLS blockers, destructive GET protection,
      financial data guardrails, preview readiness, and mobile route coverage. It never runs
      seed, wipe, migration, delete, cleanup, restore, or payment submission actions.
    </p>`);
    expect(result.status).toBe("pass");
  });

  it.each([
    "permission denied for table invoices",
    'new row violates row-level security policy for table "documents"',
    "RLS policy violation",
    "RLS check failed",
    "RLS: error while saving",
    "request violates RLS",
    "Could not find the table in the schema cache",
    "PGRST204",
    "TypeError: Cannot read properties of undefined",
    "ReferenceError: variable is not defined",
    "Unhandled Runtime Error",
    "Application error",
    "Internal Server Error",
  ])("still reports a visible real error: %s", async (message) => {
    const result = await scan(`<main><p>${message}</p></main>`);
    expect(result.status).toBe("critical");
    expect(result.diagnosticCode).toBe("page_raw_technical_error");
  });

  it("still checks System Health when an actual error follows its explanatory copy", async () => {
    const result = await scan(
      "<p>Safe self-check for auth/RLS blockers.</p><p>RLS policy violation</p>"
    );
    expect(result.diagnosticCode).toBe("page_raw_technical_error");
    expect(result.status).toBe("critical");
  });

  it.each([401, 403, 500])("preserves HTTP failure detection for %s", async (status) => {
    expect((await scan("<p>System QA</p>", status)).status).toBe("critical");
  });
});
