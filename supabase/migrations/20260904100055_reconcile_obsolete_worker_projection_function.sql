-- Production already uses only hh_sync_worker_to_labor_workers_projection_trigger.
-- Remove the obsolete duplicate clean-replay path before dropping its exact function signature.
set lock_timeout = '1s';
set statement_timeout = '5s';

drop trigger if exists sync_worker_to_labor_workers_trigger on public.workers;
drop function if exists public.sync_worker_to_labor_workers();

reset statement_timeout;
reset lock_timeout;
