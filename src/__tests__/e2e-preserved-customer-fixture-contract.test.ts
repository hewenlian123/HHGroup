import { describe, expect, it } from "vitest";

import { E2E_PRESERVED_CUSTOMER_ID } from "../../tests/e2e-cleanup-db";

describe("preserved E2E customer fixture", () => {
  it("uses the RFC UUID shape accepted by atomic customer RPCs", () => {
    expect(E2E_PRESERVED_CUSTOMER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
