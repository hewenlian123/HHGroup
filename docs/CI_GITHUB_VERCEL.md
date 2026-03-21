# GitHub Actions → tests → Vercel

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

## What runs

| Step       | Command                      | Notes                                                                    |
| ---------- | ---------------------------- | ------------------------------------------------------------------------ |
| Unit tests | `npm run test:unit`          | Vitest (`src/__tests__/**/*.test.ts`)                                    |
| Format     | `npm run format:check:ci`    | Prettier on workflows, docs, configs (full repo: `npm run format:check`) |
| ESLint     | `npm run lint:ci`            | `src/__tests__` only; full app: `npm run lint`                           |
| E2E        | `npm run test:e2e:ci`        | Playwright **chromium** only; excludes payment/delete-mutation specs     |
| Build      | `npm run build`              | Uses `NEXT_PUBLIC_*` from workflow env                                   |
| Deploy     | `amondnet/vercel-action@v25` | **Only** on `push` to `main`                                             |

Playwright starts **`npm run start`** automatically when `CI=true` (see `playwright.config.ts` `webServer`).

## GitHub configuration

### Secrets (repository → Settings → Secrets and variables)

**Deploy (required for production job):**

- `VERCEL_TOKEN` — Vercel account → Settings → Tokens
- `VERCEL_ORG_ID` — Team / user id (`.vercel/project.json` after `vercel link`, or Vercel dashboard)
- `VERCEL_PROJECT_ID` — Project id (same sources)

**Optional (better builds & E2E against real data):**

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (also used at build time)
- Variable `NEXT_PUBLIC_SUPABASE_URL` — Repository **Variables** (public URL is non-secret)

If these are missing, the workflow uses placeholders so `next build` can succeed; E2E may skip more tests.

### Duplicate deploys

If the Vercel GitHub integration **also** deploys `main`, you get two production deploys. Either:

- disable automatic Production Deployments for `main` in Vercel and rely on this workflow, **or**
- remove the `deploy-vercel` job from `ci.yml` and keep only tests in Actions (let Vercel deploy on push).

## Local commands

```bash
npm run test:unit          # Vitest
npm run test:e2e:install   # Playwright browsers (dev)
npm run test:e2e:install:ci # Chromium + OS deps (like CI)
npm run test:e2e:ci        # Stop anything on :3000 first, or unset CI to use your dev server
npm run format             # Prettier write
npm run format:check:ci    # Prettier check (CI scope)
npm run lint               # next lint (full tree)
npm run lint:ci            # ESLint tests only
```
