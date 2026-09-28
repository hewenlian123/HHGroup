begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Match the existing Finance owner/admin boundary; preserve grants and write permissions.
alter policy company_read on public.expense_operations
  using ((select private.can_manage_company()));
alter policy company_read on public.expense_source_links
  using ((select private.can_manage_company()));
alter policy company_read on public.expense_review_issues
  using ((select private.can_manage_company()));
alter policy company_read on public.expense_operation_events
  using ((select private.can_manage_company()));

notify pgrst, 'reload schema';
commit;
