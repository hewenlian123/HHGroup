-- Some deployed databases retain expenses.source_id as uuid; fresh replay uses text.
-- Preserve that column, existing values, function authority and all financial invariants.
set lock_timeout = '5s';
set statement_timeout = '60s';

do $compatibility$
declare
  source_type oid;
  patch record;
  function_oid oid;
  definition text;
  original_acl aclitem[];
  original_security_definer boolean;
  original_config text[];
  occurrences integer;
  patched_occurrences integer;
begin
  select atttypid into source_type from pg_catalog.pg_attribute
  where attrelid='public.expenses'::regclass and attname='source_id' and not attisdropped;
  if source_type = 'text'::regtype then return; end if;
  if source_type is distinct from 'uuid'::regtype then
    raise exception 'Unsupported expenses.source_id type; compatibility requires review';
  end if;

  for patch in select * from (values
    ('public.create_expense_atomic(text,jsonb)',
      $old$nullif(p_payload->>'sourceId', ''),$old$,
      $new$nullif(p_payload->>'sourceId', '')::uuid,$new$),
    ('public.update_expense_atomic(uuid,jsonb,jsonb,boolean,jsonb)',
      $old$nullif(p_header_patch->>'sourceId', '') else e.source_id$old$,
      $new$nullif(p_header_patch->>'sourceId', '')::uuid else e.source_id$new$),
    ('public.create_paid_reimbursement_expense()',
      E'e.source_id = new.id::text\n',
      E'e.source_id = new.id\n'),
    ('public.create_paid_reimbursement_expense()',
      E'\n    new.id::text,', E'\n    new.id,'),
    ('public.record_worker_reimbursement_payment_atomic(text,uuid,text,date,text,uuid[])',
      E'e.source_id = wr.id::text\n',
      E'e.source_id = wr.id\n'),
    ('public.reconcile_bank_transaction_expense_atomic(text,uuid,text,text,jsonb)',
      E'e.source_id = p_bank_transaction_id::text\n',
      E'e.source_id = p_bank_transaction_id\n'),
    ('public.reconcile_bank_transaction_expense_atomic(text,uuid,text,text,jsonb)',
      E'\n    p_bank_transaction_id::text\n', E'\n    p_bank_transaction_id\n')
  ) as patches(signature, old_fragment, new_fragment)
  loop
    function_oid := pg_catalog.to_regprocedure(patch.signature);
    if function_oid is null then
      raise exception 'Missing financial function %; compatibility requires review', patch.signature;
    end if;
    select pg_catalog.pg_get_functiondef(oid), proacl, prosecdef, proconfig
      into definition, original_acl, original_security_definer, original_config
      from pg_catalog.pg_proc where oid=function_oid;
    occurrences := (length(definition) - length(replace(definition, patch.old_fragment, '')))
      / length(patch.old_fragment);
    patched_occurrences := (length(definition) - length(replace(definition, patch.new_fragment, '')))
      / length(patch.new_fragment);
    if occurrences = 0 and patched_occurrences = 1 then continue; end if;
    if occurrences <> 1 or patched_occurrences <> 0 then
      raise exception 'Expected one source-ID anchor in %, found % old/% patched; compatibility requires review', patch.signature, occurrences, patched_occurrences;
    end if;
    execute replace(definition, patch.old_fragment, patch.new_fragment);
    if exists(select 1 from pg_catalog.pg_proc where oid=function_oid
      and (proacl is distinct from original_acl or prosecdef is distinct from original_security_definer
        or proconfig is distinct from original_config)) then
      raise exception 'Source-ID compatibility changed authority for %', patch.signature;
    end if;
  end loop;
end;
$compatibility$;

notify pgrst, 'reload schema';
