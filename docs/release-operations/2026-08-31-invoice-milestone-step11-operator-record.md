# HH Group step 11 operator, window, and backup record

**Status:** READY FOR EXPLICIT AUTHORIZATION — Dashboard restore operability
verified; window closed.

This record identifies the operator and recovery inputs for step 11. It does
not authorize a Production write, migration, restore, or deployment.

## Release and target

- Release artifact: the clean successor commit containing this record and
  `20260901042341_invoice_milestone_atomicity.sql`.
- Parent: `a625bec077fc2fde5d14e33787209022a0a6f4ea`.
- Production project: `rzublljldebswurgdqxp` (`HH Main Project Sofeware`).
- Region/database: `us-east-2`, PostgreSQL 17.
- Migration scope: step 11 only; migration first, exact successor app second.

## Named operator and incident owner

- Release operator: `WEN`, using the verified local macOS account `solidcore`
  and the authenticated Supabase CLI profile that read the project's backup
  metadata.
- Incident/recovery owner: `WEN`.
- An alternate operator requires a new authorization record naming that
  operator, the exact successor commit, and the step-11 hash.

## Change window

- Current state: **CLOSED**.
- Opening condition: explicit user authorization for the two ordered stages,
  naming the exact successor commit and migration blob
  `36f835f28af473de664ebbd3a5375b148f4862f9`, after fresh preflight and a
  verified milestone-Invoice write freeze.
- Start: record the UTC timestamp immediately before the authorized write.
- Duration: 30 minutes from the recorded start.
- Close early on target mismatch, pending-set drift, backup drift, failure,
  timeout, catalog mismatch, or any unplanned operation.
- Window scope: first step 11 and its read-only post-checks, then the exact
  successor application and read-only health check. Migration verification is
  a hard gate between the stages; the single change authorization does not
  permit reversing their order.

The closed window is intentional: a technically ready gate must stop before
Production migration and wait for authorization.

## Scoped write quiescence

- Freeze scope: both Estimate→milestone Invoice entrypoints only; unrelated
  operational workflows remain outside this release record.
- Before opening the window, the operator must prove exclusive operational
  control, announce the freeze to every owner/admin with access, and capture
  the canonical read-only association/duplicate counts from
  `scripts/preflight-invoice-milestone-step11.sql`.
- Keep the freeze active from before step 11 until the exact successor app is
  deployed and its Production-runtime health check passes.
- If the app cannot deploy inside the window after a successful migration,
  keep the freeze active, preserve the compatible parent app for all other
  workflows, and enter incident/forward-fix handling. Do not reopen the two
  Invoice entrypoints on the parent app.
- Before lifting the freeze, rerun the canonical read-only counts. In script
  output order, the Production baseline is `(0, 1, 0, 1, 0)`: one May 2026
  `invoiced` milestone has no Invoice link and one May 2026 linked milestone
  predates its required activity event. This release does not repair either
  historical row. All five counts must remain exactly equal before and after;
  any delta is `STOP`.

If the operator cannot prove exclusive control or maintain this scoped freeze,
the rollout is `STOP`; timing alone is not a safety mechanism.

## Backup evidence

Read-only `supabase backups list` evidence captured at
`2026-09-01T09:04:02Z` reported:

- WAL-G physical backups: enabled.
- PITR: disabled.
- Latest completed physical backup ID: `1544411622`.
- Latest completed timestamp: `2026-09-01T08:21:45.998Z`.
- Every backup returned by the fresh listing was `COMPLETED`; no pending or
  failed backup is accepted as a recovery point.

Before opening the window, repeat the list operation and select the newest
`COMPLETED` physical backup created before step 11. Pending or failed backups
are unacceptable. The restore behavior and downtime implications must be
reconfirmed against the official Supabase Database Backups documentation:
<https://supabase.com/docs/guides/platform/backups>.

## Restore verification and limitation

- The named authenticated CLI profile can list physical backups for the exact
  Production project.
- At `2026-09-01T09:20:15Z`, WEN authenticated to the Supabase Dashboard and
  opened project `rzublljldebswurgdqxp`, shown as `HH Main Project Sofeware /`
  `main Production`, at **Database > Backups > Scheduled backups**.
- The newest visible row was the physical backup at
  `2026-09-01T08:21:45.998Z` (`01 Sep 2026 08:21:45 (+0000)` in the
  Dashboard), matching CLI backup ID `1544411622`. Its initial `Restore`
  control was visible and enabled.
- WEN selected that initial control and successfully entered the
  `Restore from backup` confirmation dialog. The dialog named the exact same
  backup timestamp, displayed the downtime/data-loss warning, and exposed the
  final `Restore` control. This proves the named operator can enter the restore
  workflow for the selected completed backup.
- The final `Restore` control was **not clicked**. WEN selected `Cancel`; the
  confirmation dialog closed and the browser remained on the scheduled-backup
  page. No restore was started or confirmed.
- PITR is disabled, so `supabase backups restore --timestamp ...` is not this
  release's recovery path. Use the Supabase Dashboard physical-backup restore
  flow for the selected completed backup.
- A physical restore makes the project unavailable and may lose changes after
  the selected backup. It is incident recovery, not routine migration rollback.
- No restore was executed because that is a destructive Production operation
  outside this pre-deploy scope.
- Immediately before any separately authorized incident restore, WEN must
  repeat the backup listing and Dashboard selection check. This operability
  verification does not grant restore authorization.
- An incident restore requires separate explicit authorization, the selected
  backup ID/timestamp, announced downtime, and captured completion evidence.

## Step 11 recovery decision

Step 11 adds a wrapper RPC and ACL but performs no business-data rewrite. The
default response to failure is to keep the compatible parent app running,
inspect ledger/function/ACL state read-only, preserve recorded history, and use
a newly generated reviewed forward migration. Physical restore is reserved for
an incident finding of schema or data corruption severe enough to justify
destructive recovery and downtime.

## Authorization ledger

- Production migration authorization: **NOT GRANTED**.
- Production application deployment authorization: **NOT GRANTED**.
- Scoped milestone-Invoice write freeze: **NOT ACTIVATED — window closed**.
- Production restore authorization: **NOT GRANTED**.
- Window start/end: **NOT OPENED**.
- Dashboard restore permission/selectability evidence: **VERIFIED — PASS**.
