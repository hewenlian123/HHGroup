import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPaymentsReceivedByInvoiceId } from "@/lib/payments-received-db";

const mocks = vi.hoisted(() => ({
  readProject: vi.fn(),
  client: { marker: "request-session" },
}));

function NewInvoiceClient() {
  return null;
}
function ServerDataLoadFallback() {
  return null;
}

// Execute the real server page with external reads replaced. The repository's
// Node Vitest configuration preserves JSX, so compile this server entry locally.
function NewInvoicePage(props: { searchParams: Promise<{ projectId: string }> }) {
  const dependencies: Record<string, unknown> = {
    "./new-invoice-client": { default: NewInvoiceClient },
    "./estimate-prefill": { getEstimateInvoicePrefill: vi.fn() },
    "@/lib/projects-db": { getProjectByIdWithClient: mocks.readProject },
    "@/lib/supabase-server": { getServerSupabaseInternalNoStore: () => mocks.client },
    "@/lib/auth-boundary": {
      requireSupabaseOwnerOrAdminServerActionClient: async () => ({
        ok: true,
        client: mocks.client,
      }),
    },
    "@/app/estimates/_components/estimate-workflow-continuity": {
      safeEstimateReturnPath: () => null,
    },
    "@/components/server-data-load-fallback": { ServerDataLoadFallback },
    "next/navigation": {
      notFound: () => {
        throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
      },
    },
  };
  const source = readFileSync(
    new URL("../../app/financial/invoices/new/page.tsx", import.meta.url),
    "utf8"
  );
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.React },
  });
  const exports: { default?: (input: typeof props) => Promise<React.ReactElement> } = {};
  new Function("require", "exports", "React", outputText)(
    (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected server-page dependency: ${name}`);
      return dependencies[name];
    },
    exports,
    React
  );
  return exports.default!(props);
}

function paymentClient(body: unknown, status = 200) {
  return createClient("http://127.0.0.1:54321", "unit-test-session", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (!url.pathname.endsWith("/payments_received")) {
          throw new Error(`Unexpected request: ${url.pathname}`);
        }
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}

describe("required invoice payment record availability", () => {
  it("rejects a missing payments_received table instead of returning empty history", async () => {
    const client = paymentClient(
      { code: "42P01", message: 'relation "payments_received" does not exist' },
      404
    );
    await expect(getPaymentsReceivedByInvoiceId("invoice-1", client)).rejects.toThrow();
  });

  it("rejects null payment data instead of returning empty history", async () => {
    await expect(
      getPaymentsReceivedByInvoiceId("invoice-1", paymentClient(null))
    ).rejects.toThrow();
  });

  it("preserves a successful zero-row payment history", async () => {
    await expect(getPaymentsReceivedByInvoiceId("invoice-1", paymentClient([]))).resolves.toEqual(
      []
    );
  });
});

describe("New Invoice supplied project context", () => {
  beforeEach(() => {
    mocks.readProject.mockReset();
    vi.stubGlobal("React", React);
  });

  it("shows unavailable rather than a blank invoice form when the project read fails", async () => {
    mocks.readProject.mockRejectedValue(new Error("permission denied for projects"));
    const page = await NewInvoicePage({
      searchParams: Promise.resolve({ projectId: "project-1" }),
    });
    expect(page.type).toBe(ServerDataLoadFallback);
  });

  it("keeps a genuinely missing supplied project distinct from a new blank invoice", async () => {
    mocks.readProject.mockResolvedValue(null);
    await expect(
      NewInvoicePage({ searchParams: Promise.resolve({ projectId: "project-missing" }) })
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("retains project and customer IDs after a successful context read", async () => {
    mocks.readProject.mockResolvedValue({
      id: "project-1",
      name: "Test Project",
      customerId: "customer-1",
      client: "Test Customer",
    });
    const page = await NewInvoicePage({
      searchParams: Promise.resolve({ projectId: "project-1" }),
    });
    expect(page.type).toBe(NewInvoiceClient);
    expect(page.props.projectPrefill).toEqual({
      projectId: "project-1",
      projectName: "Test Project",
      customerId: "customer-1",
      customerName: "Test Customer",
    });
  });
});
