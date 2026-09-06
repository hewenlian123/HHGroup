# HH Group Production Completion Plan

**Goal:** Complete the user-authorized system audit, repair, local certification, production readiness, safe deployment, and read-only production smoke.
**Architecture:** Preserve the current working tree and canonical Supabase persistence. Repair verified root causes using existing organization authority and transaction patterns; append-only migrations, no unrelated upgrades.
**Tech Stack:** Node 22, Next.js 14, React, TypeScript, Supabase/Postgres, Vitest, Playwright, Vercel.
**Spec:** User attachment a6289bd0-99d5-41a5-8f73-b31e3096b517/pasted-text.txt.

## Constraints

- Never destroy production data or use production mutation fixtures.
- Preserve existing correct uncommitted changes; no history rewrite or force push.
- Preserve financial meaning and separate AR/AP/Labor ledgers.
- Real empty is valid; query/permission failures are unavailable; writes fail explicitly.
- Main coordinates database resets/migrations and full-suite execution. Audit agents start read-only.

## Execution and certification

- [x] Audit AR/AP, Labor/Expenses/Accounts, Security/Projects; record verified defects and targeted files before fixes.
- [x] Reproduce each defect with focused tests, implement minimal fixes, independently review and rerun affected verification.
- [x] Validate append-only migration filenames/order, clean local replay and populated upgrade compatibility while preserving pre-existing local data.
- [x] Run strict schema preflight, schema/code checks, security, financial/concurrency/idempotency, and local DB tests.
- [x] Run required unit/source contracts, typecheck, lint, production build; resolve in-scope failures.
- [x] Browser matrix: Projects/Materials/Documents, AR/AP/Labor, Expenses/Accounts and critical navigation at 1440x900, 768x1024, 390x844. Check persistence, empty/unavailable/write failure states, overflow and console/page errors. Existing HH/Figma intent is authoritative; no redesign or new palette.
- [x] Verify exact fixture ownership cleanup: DB, Storage, Auth residuals zero.
- [x] Audit final diff, secrets/debug/generated files, runtime/env/routes, production migration/data compatibility and recovery approach.
- [x] Apply only reviewed data-safe production migrations; deploy current reviewed app to the verified existing production target.
- [x] Read-only production smoke: health, login/session, Projects, Estimates, Finance, Invoice, Payables, Labor, Contacts, runtime and browser errors, critical responsive routes.
- [x] Report every requested completion gate with evidence; claim PASS only when all gates pass.

Initial source hashes and existing uncommitted work manifest: /tmp/hh-production-start-manifest.json. Detailed commands/artifacts are kept under /tmp until consolidated into this record.
