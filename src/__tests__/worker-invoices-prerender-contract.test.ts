import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

describe("worker invoices prerender boundary", () => {
  it("keeps the browser data workspace out of the production server render", () => {
    const page = source("src/app/labor/worker-invoices/page.tsx");
    const island = source("src/app/labor/worker-invoices/worker-invoices-client-island.tsx");

    expect(page).toMatch(
      /import\s+\{\s*WorkerInvoicesClientIsland\s*\}\s+from\s+["']\.\/worker-invoices-client-island["']/
    );
    expect(island).toMatch(/^["']use client["'];/);
    expect(island).toMatch(/import\s+dynamic\s+from\s+["']next\/dynamic["']/);
    expect(island).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/worker-invoices-client["']\)[\s\S]*?ssr:\s*false/
    );
  });
});
