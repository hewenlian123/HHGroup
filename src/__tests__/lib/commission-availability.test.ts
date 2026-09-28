import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  attachPaidTotalsToCommissions,
  getCommissionsByProject,
  type ProjectCommission,
} from "@/lib/commission-db";

const commission: ProjectCommission = {
  id: "commission-1",
  project_id: "project-1",
  person_id: null,
  person_name: "Agent One",
  role: "Agent",
  calculation_mode: "Manual",
  rate: 0,
  base_amount: 100,
  commission_amount: 10,
  notes: null,
  created_at: "2026-09-02T00:00:00",
};

describe("Commission financial availability", () => {
  it("does not report paid_amount=0 when the canonical payment source is denied", async () => {
    const client = {
      from(table: string) {
        if (table !== "commission_payments") throw new Error(`Unexpected table: ${table}`);
        return {
          select() {
            return {
              async in() {
                return { data: null, error: { code: "42501", message: "permission denied" } };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(attachPaidTotalsToCommissions([commission], client)).rejects.toThrow(
      "permission denied"
    );
  });

  it("does not treat an unavailable legacy commission source as a true empty source", async () => {
    const client = {
      from(table: string) {
        if (table === "commissions") {
          return {
            select() {
              return {
                order() {
                  return {
                    async eq() {
                      return { data: [commission], error: null };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "project_commissions") {
          return {
            select() {
              return {
                order() {
                  return {
                    async eq() {
                      return {
                        data: null,
                        error: { code: "42501", message: "legacy commissions permission denied" },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as SupabaseClient;

    await expect(getCommissionsByProject("project-1", client)).rejects.toThrow(
      "legacy commissions permission denied"
    );
  });
});
