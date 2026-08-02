import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Project PDF UI idempotency contract", () => {
  it("sends one fresh UUID idempotency key from the material PDF action", () => {
    const contents = source("../app/projects/[id]/project-materials-tab.tsx");

    expect(contents.match(/"Idempotency-Key"/g)).toHaveLength(1);
    expect(contents.match(/crypto\.randomUUID\(\)/g)).toHaveLength(1);
  });

  it("sends one fresh UUID idempotency key from each closeout PDF action", () => {
    const contents = source("../app/projects/[id]/project-closeout-tab.tsx");

    expect(contents.match(/"Idempotency-Key"/g)).toHaveLength(3);
    expect(contents.match(/crypto\.randomUUID\(\)/g)).toHaveLength(3);
  });
});
