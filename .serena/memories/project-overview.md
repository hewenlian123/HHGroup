# Project Overview

Verified from:

- `AGENTS.md`
- `README.md`
- `package.json`
- `src/app/`
- `src/lib/data/index.ts`

Last verified: 2026-08-30

## Durable facts

- HH Group is a private Next.js/React/TypeScript operational WebApp backed by Supabase. Current modules cover projects, Estimates, Invoices, Payments/Deposits, Expenses/Bills, labor/payroll, subcontractors, documents, reporting, and operational workflows.
- Canonical workspace: `/Users/solidcore/Desktop/HH Group`. Do not recover from or blend older clones, snapshots, backups, or prior Production history.
- High-level boundaries: `src/app/` owns App Router pages and route handlers; `src/components/` and `src/styles/` hold shared UI; `src/lib/` holds domain/data helpers; `supabase/migrations/` is the schema ledger; `supabase/tests/database/`, `src/__tests__/`, and `tests/` provide database, Vitest, and Playwright evidence.
- Supabase is the persistent application data source. Do not create mock or in-memory persistence as a parallel source of truth for persisted workflows.
- Development and mutation testing are local-first. Production is read-only by default; any Production mutation, migration, deployment, push, or release requires explicit authorization for that exact operation.
- Use existing domain helpers, design-system assets, components, migrations, and tests before adding abstractions or dependencies.

Re-verify if the application platform, canonical workspace, persistence authority, or top-level module ownership changes.
