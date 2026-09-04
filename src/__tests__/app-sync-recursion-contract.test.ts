import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(entry)
        ? [path]
        : [];
  });
}

describe("global app-sync recursion guard", () => {
  it("does not let useOnAppSync subscribers call the global sync producer", () => {
    const offenders = sourceFiles(APP_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const file = ts.createSourceFile(
          path,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX
        );
        let offender = false;
        const visit = (node: ts.Node): void => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "useOnAppSync" &&
            /syncRouterNonBlocking\(/.test(node.getText(file))
          ) {
            offender = true;
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
        return offender;
      })
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });

  it("does not duplicate an RSC refresh already scheduled by the sync producer", () => {
    const syncSource = readFileSync(join(ROOT, "src", "lib", "sync-router-client.ts"), "utf8");
    expect(syncSource).toMatch(
      /syncRouterAndClients[\s\S]*?dispatchClientDataSync\(\{ reason, refreshScheduled: true \}\)/
    );

    const offenders = sourceFiles(APP_ROOT)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const file = ts.createSourceFile(
          path,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX
        );
        let offender = false;
        const visit = (node: ts.Node): void => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "useOnAppSync"
          ) {
            const call = node.getText(file);
            if (/refreshRscNonBlocking\(/.test(call) && !/refreshScheduled/.test(call))
              offender = true;
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
        return offender;
      })
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });

  it("does not re-broadcast from the Project Detail app-sync listener", () => {
    const projectDetail = readFileSync(
      join(APP_ROOT, "projects", "[id]", "project-detail-tabs-client.tsx"),
      "utf8"
    );

    expect(projectDetail).not.toMatch(
      /const handler = \(ev: Event\)[\s\S]{0,500}?syncRouterNonBlocking\(/
    );
    expect(projectDetail).toMatch(
      /detail\?\.refreshScheduled[\s\S]{0,300}?refreshRscNonBlocking\(router\)/
    );
  });
});
