# GitHub Actions checks and Vercel Git Integration

Repository workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

The GitHub Actions workflow validates pushes and pull requests targeting `main`. It does not run Playwright, deploy to Vercel, or apply Supabase migrations.

## Runtime

- **Canonical repository runtime:** Node.js 22.x.
- GitHub Actions uses `actions/setup-node@v4` with Node 22.
- After the repository runtime alignment, `package.json` and the root lockfile declare `engines.node` as `22.x`; that repository setting governs future Vercel builds.
- The Vercel Dashboard currently remains set to Node 24.x. That Dashboard setting is intentionally unchanged in this phase.

Use Node 22 locally for dependency installs, tests, and builds so local results match GitHub Actions and future Vercel builds.

## What CI runs

| Step                | Command                                 | Scope                                                           |
| ------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Install             | `npm ci`                                | Frozen install from `package-lock.json`                         |
| Migration filenames | `npm run check:migration-filenames`     | Validates migration filenames                                   |
| Migration ordering  | `npm run check:migration-order`         | Rejects insertions before the existing migration tail           |
| Schema preflight    | `npm run check:schema-preflight:strict` | Strict table, policy, and schema expectations                   |
| Schema/code audit   | `npm run check:schema-vs-code`          | Checks referenced database columns against the schema inventory |
| Unit tests          | `npm run test:unit`                     | Vitest unit and contract tests                                  |
| Formatting          | `npm run format:check`                  | Full-repository Prettier check                                  |
| ESLint              | `npm run lint:ci`                       | Limited to `src/__tests__` by the current script                |
| TypeScript          | `npm run typecheck`                     | Application typecheck                                           |
| Build               | `npm run build`                         | Next.js production build                                        |

Playwright remains a local verification tool. It is intentionally absent from `.github/workflows/ci.yml`, including the non-mutating Chromium project.

## GitHub configuration

The build can consume these optional repository values:

- Repository variable `NEXT_PUBLIC_SUPABASE_URL`
- Repository secret `NEXT_PUBLIC_SUPABASE_ANON_KEY`

When they are absent, the workflow supplies non-secret placeholders so `next build` can complete. The workflow does not require `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID` because it contains no Vercel CLI/action deployment job.

## Deployment boundary

Vercel deployment is handled by the repository's **Vercel Git Integration**, configured outside GitHub Actions. Depending on the Vercel project settings, a push to `main` may trigger a Production deployment and a pull request may trigger a Preview deployment. The GitHub Actions workflow itself does not deploy, promote, or roll back a Vercel deployment.

Production Supabase migrations are never applied by the CI workflow or by the documented Git deployment path. They remain manual, explicitly authorized operations. Use the guarded [`manual-production-supabase-migration.yml`](../.github/workflows/manual-production-supabase-migration.yml) workflow only after the exact Production migration has been reviewed and approved.

## Local verification commands

```bash
npm run check:migration-filenames
npm run check:migration-order
npm run check:schema-preflight:strict
npm run check:schema-vs-code
npm run test:unit
npm run format:check
npm run lint:ci
npm run typecheck
npm run build
```

Run Playwright separately against the local application and local Supabase only, using the task-appropriate `test:e2e:*` script. Playwright success does not authorize a push, deployment, or Production migration.
