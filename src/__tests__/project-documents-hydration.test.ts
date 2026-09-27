import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps the interactive document file picker out of unhydrated server HTML", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/projects/[id]/project-detail-tabs-client.tsx"),
    "utf8"
  );
  const documentTab = source.match(/const ProjectDocumentsTab = dynamic\([\s\S]*?\n\);/)?.[0];
  expect(documentTab).toBeDefined();
  expect(documentTab).toMatch(/ssr:\s*false/);
  expect(documentTab).toMatch(/loading:\s*\(\)\s*=>\s*null/);
});
