-- Preserve the existing atomic payroll transaction and ACL; constrain explicit project scope.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $migration$
declare
  definition text;
  original text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_worker_payroll_settlement(text,uuid,uuid,numeric,text,date,text,uuid[],uuid[],uuid[],numeric)'::regprocedure
  ) into definition;
  original := definition;
  if position('and (p_project_id is null or le.project_id = p_project_id)' in definition) > 0 then
    return;
  end if;
  if position('and le.worker_id = p_worker_id' in definition) = 0
    or position('and wr.worker_id = p_worker_id' in definition) = 0 then
    raise exception 'Payroll settlement body changed; project scope migration requires review';
  end if;
  definition := replace(definition,
    'and le.worker_id = p_worker_id',
    'and le.worker_id = p_worker_id and (p_project_id is null or le.project_id = p_project_id)');
  definition := replace(definition,
    'and wr.worker_id = p_worker_id',
    'and wr.worker_id = p_worker_id and (p_project_id is null or wr.project_id = p_project_id)');
  if definition = original then
    raise exception 'Payroll project scope guard was not installed';
  end if;
  execute definition;
end;
$migration$;
