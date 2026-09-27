# HH Development Routing Matrix

Read this reference after `hh-development-router` classifies a request. Apply every matching row. Existing Skills retain authority over their own workflows.

## Route Matrix

| Observable change surface                                                                                                            | Required Skills                                                                      | Required tools and evidence                                                                                                                                 | Additive conditions                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bug, failing test, regression, or unexpected behavior                                                                                | `superpowers:systematic-debugging` -> `superpowers:test-driven-development`          | Reproduction evidence, a targeted failing regression test, affected Vitest/Playwright/pgTAP checks, then fresh verification                                 | Add financial, database, UI, or dependency routes when their predicates also match                                                 |
| Estimate, Invoice, Payment, Deposit, Expense, Payroll, Project cost, amount semantics, rounding, allocations, or financial atomicity | `hh-financial-integrity-guard`                                                       | Before/after financial regression, targeted Vitest, TypeScript when TS contracts change, Semgrep for financial/Supabase-sensitive paths                     | If SQL, RPC, schema, RLS, trigger, function, persistence mapping, or migration changes, also require `hh-database-migration-guard` |
| Migration, schema, SQL, RLS policy, RPC, function, trigger, constraint, database contract, or persistence mapping                    | `hh-database-migration-guard`                                                        | The migration guard owns inspect -> static validation -> Squawk -> local reset -> pgTAP -> affected application tests                                       | Add `hh-financial-integrity-guard` when financial data or behavior is involved                                                     |
| Rendered UI, component, layout, responsive behavior, visual state, or interaction                                                    | `hh-design-system-enforcer` -> `hh-playwright-qa`                                    | TypeScript for TS/TSX changes; Vitest when behavior/state logic changes; Playwright matrix, console/page errors, overflow, screenshots, and visual evidence | Add debugging/TDD for a UI bug; add financial guard when protected financial meaning can change                                    |
| Dependency manifest or lockfile                                                                                                      | `superpowers:test-driven-development` when part of a feature or bugfix               | TypeScript, affected Vitest/Playwright suites, `osv-scanner` against the changed lockfile                                                                   | Add domain routes for behavior affected by the dependency                                                                          |
| Major implementation completion or pre-merge review                                                                                  | `superpowers:requesting-code-review` -> `superpowers:verification-before-completion` | Review findings plus fresh full applicable checks                                                                                                           | This is a completion route, not a substitute for domain routes                                                                     |
| README/prose-only edit with no runtime effect                                                                                        | None                                                                                 | Optional documentation inspection only                                                                                                                      | Do not activate financial or database guards                                                                                       |
| Ordinary conversation                                                                                                                | None                                                                                 | None                                                                                                                                                        | Do not activate this router                                                                                                        |

### Read-only planning boundary

A request limited to read-only planning or impact analysis remains a planning route. The words `large`, `cross-file`, `structural`, `codemod`, and `refactor` do not by themselves activate the Bug, TDD, or Major Completion routes. Select Serena and/or ast-grep only when their independent predicates match. If edits begin, reclassify the request: actual implementation or refactoring remains subject to `superpowers:test-driven-development`, and code review activates only at major completion or pre-merge review.

## Route Ordering

When several routes match, use this order without dropping any route:

1. Safety and authority guards: financial, database, design.
2. Diagnostic discipline: systematic debugging.
3. Regression-first implementation discipline: test-driven development.
4. Targeted static and automated checks.
5. Browser QA when rendered behavior is affected.
6. Code review for major completion.
7. Verification before any completion claim.

`financial + database` therefore means both `hh-financial-integrity-guard` and `hh-database-migration-guard`, followed by all evidence required by both.

## Minimal Sufficient Tool Selection

Select these tools only when the observable investigation or verification need matches. They supplement the active route and its authoritative Skills; they do not create a new route or replace domain evidence.

| Observable need                                                                                     | Select                                                  | Boundaries                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large cross-file change where symbol definitions, references, callers, or impact must be understood | Serena                                                  | Use configured Serena MCP symbol/definition/reference tools. Do not add it for a known, local single-file edit.                                                                                                           |
| Structural syntax search or a specifically requested, reviewable codemod                            | ast-grep                                                | Start with read-only AST search. Do not use a text search when syntax structure is the predicate, and do not apply a codemod without implementation authority and scoped review.                                          |
| Dead code, unused exports, files, or dependency investigation                                       | Knip                                                    | Report findings first. Do not delete or rewrite findings automatically.                                                                                                                                                   |
| Logic has meaningful invariants across broad boundary, financial, or combinatorial inputs           | fast-check                                              | Add a targeted Vitest property only when the property can be stated independently and property-based testing has clear value. Do not add it to every financial change or replace literal regression examples.             |
| Architecture, module-boundary, dependency-direction, or circular-dependency investigation           | dependency-cruiser                                      | Report cycles and boundary findings first. Do not refactor modules automatically.                                                                                                                                         |
| Rendered UI, form, or navigation accessibility is in scope                                          | `@axe-core/playwright` together with `hh-playwright-qa` | Keep complete assertions and report violations; never suppress rules or lower an assertion to force a pass. This does not automatically invoke `color-contrast` unless rendered contrast evidence is explicitly in scope. |

The tools compose only when their predicates independently match. For example, Serena and ast-grep may both be selected for a large cross-file structural codemod that needs symbol-impact analysis, but neither is a default companion of the other. Never run all optional tools as a generic completion suite.

## Tool Entry Points

Run from the HH repository root and use Node 22 where package scripts require Node:

| Tool                   | Entry point                                                                                                   | Use when                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TypeScript             | `fnm exec --using=22 npm run typecheck`                                                                       | TypeScript contracts or source changed                                                        |
| Vitest                 | `fnm exec --using=22 npm run test:unit -- <affected-test-paths>`                                              | Business logic, state, regression, or unit/integration contracts changed                      |
| Playwright             | `fnm exec --using=22 npm run test:e2e -- <affected-specs>`                                                    | UI, navigation, responsive behavior, or critical workflows changed; follow `hh-playwright-qa` |
| Semgrep                | `semgrep --metrics=off --config .semgrep/hh-financial-supabase.yml <changed-paths>`                           | Financial or Supabase-sensitive source/SQL changed                                            |
| pgTAP                  | `fnm exec --using=22 npm run test:db:local`                                                                   | Database route reached its post-reset verification stage                                      |
| Squawk                 | Use the project-local Squawk binary against the new migration files selected by `hh-database-migration-guard` | New forward migration exists                                                                  |
| OSV-Scanner            | `osv-scanner scan source --lockfile package-lock.json`                                                        | `package.json` or `package-lock.json` changed                                                 |
| Serena                 | Configured Serena MCP symbol, definition, and reference tools                                                 | Large cross-file symbol impact or codebase navigation is required                             |
| ast-grep               | Project-local `ast-grep` CLI, read-only search before any codemod                                             | A syntax-aware structural predicate is required                                               |
| Knip                   | Project-local `knip` CLI                                                                                      | Dead code or unused dependency investigation is requested; findings are report-only           |
| fast-check             | Import the project-local `fast-check` library from a targeted Vitest property test                            | A clear invariant warrants generated boundary or combinatorial inputs                         |
| dependency-cruiser     | Project-local `depcruise` CLI                                                                                 | Architecture boundaries, dependency direction, or cycles are under investigation              |
| `@axe-core/playwright` | Import `AxeBuilder` from the project-local package in a targeted Playwright test                              | UI, form, or navigation accessibility evidence is required; follow `hh-playwright-qa`         |

Start targeted. Broaden when shared contracts, cross-domain behavior, or risk require it. Preserve command, exit status, scope, and failure output. Environment or permission failures are `BLOCKED`, never `PASS`.

## UI Review Boundaries

- `impeccable` may supplement a requested design critique or polish task, but `hh-design-system-enforcer` remains HH implementation authority.
- `color-contrast` is evidence-only and applies when rendered color/contrast evidence is in scope, not to every UI edit.
- `review-animations` is explicit-invocation-only and review-only.
