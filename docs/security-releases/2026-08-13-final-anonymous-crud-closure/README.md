# Final Anonymous CRUD Closure

Direct successor to certified baseline `693ec2aaa2e53c6e54ed16fcd401a3c401606d3c`.

## Scope and root cause

The only changed data-access scope is `public.cost_allocations`,
`public.material_selections`, and `public.material_selection_items`. The
authoritative historical migrations granted broad table privileges and created
permissive RLS policies. This artifact removes those grants/policies without
rewriting history or changing data, schema columns, foreign keys, triggers,
financial calculations, or Storage.

## Legitimate access model

- `cost_allocations`: no current product call path exists. Direct `anon`,
  `authenticated`, and `service_role` access is denied.
- `material_selections` and `material_selection_items`: server-mediated only.
  `anon`, authenticated non-owners, and direct authenticated owner/admin table
  requests are denied. Strict owner/admin server pages, Server Actions, and API
  routes authorize the request before constructing a server-only service-role
  client. That client has Material Selection CRUD only.
- The service-role key remains server-only; no client component imports or
  receives it.

## Required preconditions and state classification

- Required: all three tables and a `service_role` role with `BYPASSRLS` exist.
- Already satisfied: the known historical permissive policies are absent.
- Incompatible: an unclassified scoped RLS policy exists. The migration aborts
  so it can be classified rather than silently removed.

Run `production-preflight.sql` read-only before requesting production approval.
Run `access-matrix-verification.sql` only in isolated local certification.

## Rollback

`supabase/rollbacks/20260813002206_final_anonymous_crud_closure.rollback.sql`
requires the exact transaction-local `hh.rollback_confirmation` value and has
no `COMMIT`. It restores the immediate pre-release insecure grant/policy state
only for an explicitly approved, time-limited compatibility investigation.

Receipt Security: unchanged. No receipt table, route, bucket, or Storage policy
is changed.

Financial correctness: unchanged. No amount, balance, cost formula, project
cost aggregation, labor, worker payment, or accounting record is changed.
