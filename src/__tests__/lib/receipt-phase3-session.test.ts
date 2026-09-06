import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { sign } = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => ({
    storage: { from: () => ({ createSignedUrl: sign }) },
    from: () => {
      throw new Error("Reference reads must use the session");
    },
  }),
}));
import { loadExpenseReceiptManifest } from "@/lib/expense-receipt-server";
function session(denied?: string) {
  return createClient("http://127.0.0.1:54321", "fixture-session", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const table = new URL(String(input)).pathname.split("/").at(-1);
        const value =
          table === denied
            ? { code: "42501", message: "permission denied" }
            : table === "expenses"
              ? { id: "e1", receipt_url: "expense-attachments/fixture/receipt.jpg" }
              : [];
        return new Response(JSON.stringify(value), {
          status: table === denied ? 403 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}
describe("Receipt reference session boundary", () => {
  beforeEach(() =>
    sign
      .mockReset()
      .mockResolvedValue({ data: { signedUrl: "https://fixture.invalid/signed" }, error: null })
  );
  it.each(["expenses", "attachments", "expense_attachments"])(
    "cannot sign a reference when session cannot read %s",
    async (table) => {
      await expect(loadExpenseReceiptManifest("e1", session(table))).rejects.toThrow("unavailable");
      expect(sign).not.toHaveBeenCalled();
    }
  );
});
