This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## HH: data flow & E2E

- **How modules stay in sync:** `docs/DATA_AND_INTEGRATION.md` (entities, routes, `syncRouterAndClients` / `useOnAppSync`).
- **Prove cross-page links work:** `npm run test:e2e:integration` (needs dev server + Supabase; uses `E2E_BASE_URL` if set).
- **Delete surfaces / mutations:** see `package.json` scripts `test:e2e:delete-catalog`, `test:e2e:delete`, and payment specs.
- **Company Profile + Logo + 单据 Header：** [`docs/company-profile-logo-header-verification.md`](docs/company-profile-logo-header-verification.md)（测试清单与命令）；落地 SQL / 环境变量见 [`docs/supabase-company-profile-without-db-push.md`](docs/supabase-company-profile-without-db-push.md)。自动化：`npm run test:e2e:company-branding`。

## Testing & code quality

| Tool                   | Scripts                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema checks**      | `npm run check:migration-filenames`, `npm run check:migration-order`, `npm run check:schema-preflight:strict`, `npm run check:schema-vs-code` |
| **Vitest**             | `npm run test:unit` / `npm test` (watch)                                                                                                      |
| **Playwright**         | Local only: use the task-appropriate `test:e2e:*` script; install browsers with `npm run test:e2e:install`                                    |
| **Prettier**           | `npm run format`, `npm run format:check`; CI runs the full `format:check`                                                                     |
| **ESLint**             | `npm run lint`; CI runs limited `npm run lint:ci` coverage for `src/__tests__`                                                                |
| **TypeScript / build** | `npm run typecheck`, `npm run build`                                                                                                          |

**GitHub Actions:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs schema checks, Vitest, full-repository Prettier, limited ESLint, TypeScript, and a Next.js build. It does **not** run Playwright or deploy. Vercel deployments are handled separately by the external Git Integration. See [`docs/CI_GITHUB_VERCEL.md`](docs/CI_GITHUB_VERCEL.md).

## Getting Started

Use Node.js **22.x**, the canonical repository runtime. GitHub Actions uses Node 22. The Vercel Dashboard remains set to 24.x in this phase, while the repository's `engines.node: 22.x` setting governs future Vercel builds.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Vercel deployment is handled by the repository's Git Integration, configured outside GitHub Actions. A push to `main` may trigger a Production deployment according to the Vercel project settings; `.github/workflows/ci.yml` does not call Vercel or gate Production migrations.

Production Supabase migrations remain manual and require explicit authorization. They are not run by GitHub Actions or by the documented Git deployment path.

**Before production:** see [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) (env vars, migrations, pay/receipt/delete verification).

If `next build` fails with a missing webpack chunk (e.g. `Cannot find module './xxxx.js'`), run `npm run build:clean` and retry.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
