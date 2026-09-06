import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  workers: vi.fn(),
  labor: vi.fn(),
  invoices: vi.fn(),
  payments: vi.fn(),
  daily: vi.fn(),
}));
vi.mock("@/lib/auth-boundary", () => ({ requireSupabaseOwnerOrAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase-server", () => ({ getServerSupabaseInternalNoStore: () => ({}) }));
vi.mock("@/lib/labor-db", () => ({ getWorkers: mocks.workers }));
vi.mock("@/lib/daily-labor-db", () => ({ getLaborEntriesWithJoins: mocks.labor }));
vi.mock("@/lib/daily-work-db", () => ({
  getDailyWorkEntriesInRange: mocks.daily,
  totalPayForEntry: () => 0,
}));
vi.mock("@/lib/worker-invoices-db", () => ({ getWorkerInvoices: mocks.invoices }));
vi.mock("@/lib/worker-payments-db", () => ({ getWorkerPaymentsWithClient: mocks.payments }));
import { GET } from "@/app/api/workers/summary/route";

beforeEach(() => {
  vi.resetAllMocks();
  for (const read of Object.values(mocks)) read.mockResolvedValue([]);
  mocks.workers.mockResolvedValue([{ id: "w1", name: "Fixture" }]);
});
describe("worker summary availability", () => {
  it.each(["labor", "invoices", "payments", "daily"] as const)(
    "does not report zero after %s fails",
    async (source) => {
      mocks[source].mockRejectedValue(new Error("Financial data unavailable"));
      const response = await GET(new Request("http://localhost/api/workers/summary"));
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty("rows");
    }
  );
  it("retains valid zero for successful empty sources", async () => {
    const response = await GET(new Request("http://localhost/api/workers/summary"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rows: [{ earned: 0, paid: 0, outstanding: 0 }] });
  });
});
