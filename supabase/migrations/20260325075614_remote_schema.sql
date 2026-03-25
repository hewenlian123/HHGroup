drop extension if exists "pg_net";

drop trigger if exists "trg_ap_bill_payments_recompute" on "public"."ap_bill_payments";

drop trigger if exists "trg_ap_bills_recompute_on_amount" on "public"."ap_bills";

drop trigger if exists "trg_ap_bills_updated_at" on "public"."ap_bills";

drop trigger if exists "trg_bank_transactions_updated_at" on "public"."bank_transactions";

drop trigger if exists "trg_bill_items_recompute_after_change" on "public"."bill_items";

drop trigger if exists "trg_bill_items_set_line_total" on "public"."bill_items";

drop trigger if exists "trg_bill_payments_recompute_after_change" on "public"."bill_payments";

drop trigger if exists "trg_bill_payments_validate_status" on "public"."bill_payments";

drop trigger if exists "trg_bills_recompute_after_update" on "public"."bills";

drop trigger if exists "trg_bills_updated_at" on "public"."bills";

drop trigger if exists "trg_categories_updated_at" on "public"."categories";

drop trigger if exists "trg_commitments_updated_at" on "public"."commitments";

drop trigger if exists "trg_company_profile_updated_at" on "public"."company_profile";

drop trigger if exists "trg_customers_updated_at" on "public"."customers";

drop trigger if exists "trg_activity_expense_line" on "public"."expense_lines";

drop trigger if exists "trg_expense_lines_recompute_after_change" on "public"."expense_lines";

drop trigger if exists "trg_expenses_updated_at" on "public"."expenses";

drop trigger if exists "trg_invoice_items_recompute_after_change" on "public"."invoice_items";

drop trigger if exists "trg_invoice_items_set_amount" on "public"."invoice_items";

drop trigger if exists "trg_invoice_payments_recompute_after_change" on "public"."invoice_payments";

drop trigger if exists "trg_activity_invoice" on "public"."invoices";

drop trigger if exists "trg_invoices_recompute_after_tax_change" on "public"."invoices";

drop trigger if exists "trg_invoices_updated_at" on "public"."invoices";

drop trigger if exists "trg_payment_methods_updated_at" on "public"."payment_methods";

drop trigger if exists "trg_profiles_updated_at" on "public"."profiles";

drop trigger if exists "trg_projects_updated_at" on "public"."projects";

drop trigger if exists "trg_subcontractors_updated_at" on "public"."subcontractors";

drop trigger if exists "trg_vendors_updated_at" on "public"."vendors";

drop trigger if exists "sync_worker_to_labor_workers_trigger" on "public"."workers";

drop trigger if exists "trg_workers_updated_at" on "public"."workers";

drop policy "accounts_delete_all" on "public"."accounts";

drop policy "accounts_insert_all" on "public"."accounts";

drop policy "accounts_select_all" on "public"."accounts";

drop policy "accounts_update_all" on "public"."accounts";

drop policy "ap_bill_payments_delete_all" on "public"."ap_bill_payments";

drop policy "ap_bill_payments_insert_all" on "public"."ap_bill_payments";

drop policy "ap_bill_payments_select_all" on "public"."ap_bill_payments";

drop policy "ap_bill_payments_update_all" on "public"."ap_bill_payments";

drop policy "ap_bills_delete_all" on "public"."ap_bills";

drop policy "ap_bills_insert_all" on "public"."ap_bills";

drop policy "ap_bills_select_all" on "public"."ap_bills";

drop policy "ap_bills_update_all" on "public"."ap_bills";

drop policy "attachments_perm_delete" on "public"."attachments";

drop policy "attachments_perm_insert" on "public"."attachments";

drop policy "attachments_perm_select" on "public"."attachments";

drop policy "attachments_perm_update" on "public"."attachments";

drop policy "bank_transactions_delete_all" on "public"."bank_transactions";

drop policy "bank_transactions_insert_all" on "public"."bank_transactions";

drop policy "bank_transactions_select_all" on "public"."bank_transactions";

drop policy "bank_transactions_update_all" on "public"."bank_transactions";

drop policy "bill_items_perm_delete" on "public"."bill_items";

drop policy "bill_items_perm_insert" on "public"."bill_items";

drop policy "bill_items_perm_select" on "public"."bill_items";

drop policy "bill_items_perm_update" on "public"."bill_items";

drop policy "bill_payments_perm_delete" on "public"."bill_payments";

drop policy "bill_payments_perm_insert" on "public"."bill_payments";

drop policy "bill_payments_perm_select" on "public"."bill_payments";

drop policy "bill_payments_perm_update" on "public"."bill_payments";

drop policy "bills_perm_delete" on "public"."bills";

drop policy "bills_perm_insert" on "public"."bills";

drop policy "bills_perm_select" on "public"."bills";

drop policy "bills_perm_update" on "public"."bills";

drop policy "categories_perm_delete" on "public"."categories";

drop policy "categories_perm_insert" on "public"."categories";

drop policy "categories_perm_select" on "public"."categories";

drop policy "categories_perm_update" on "public"."categories";

do $$
begin
  if to_regclass('public.commission_payment_records') is not null then
    drop policy if exists "commission_payment_records_delete" on "public"."commission_payment_records";
    drop policy if exists "commission_payment_records_insert" on "public"."commission_payment_records";
    drop policy if exists "commission_payment_records_select" on "public"."commission_payment_records";
    drop policy if exists "commission_payment_records_update" on "public"."commission_payment_records";
  end if;
end $$;

drop policy "commitments_delete_all" on "public"."commitments";

drop policy "commitments_insert_all" on "public"."commitments";

drop policy "commitments_select_all" on "public"."commitments";

drop policy "commitments_update_all" on "public"."commitments";

drop policy "customers_perm_delete" on "public"."customers";

drop policy "customers_perm_insert" on "public"."customers";

drop policy "customers_perm_select" on "public"."customers";

drop policy "customers_perm_update" on "public"."customers";

drop policy "deposits_delete_all" on "public"."deposits";

drop policy "deposits_insert_all" on "public"."deposits";

drop policy "deposits_select_all" on "public"."deposits";

drop policy "deposits_update_all" on "public"."deposits";

drop policy "estimate_payment_schedule_delete_all" on "public"."estimate_payment_schedule";

drop policy "estimate_payment_schedule_insert_all" on "public"."estimate_payment_schedule";

drop policy "estimate_payment_schedule_select_all" on "public"."estimate_payment_schedule";

drop policy "estimate_payment_schedule_update_all" on "public"."estimate_payment_schedule";

do $$
begin
  if to_regclass('public.inspection_log') is not null then
    drop policy if exists "inspection_log_delete_all" on "public"."inspection_log";
    drop policy if exists "inspection_log_insert_all" on "public"."inspection_log";
    drop policy if exists "inspection_log_select_all" on "public"."inspection_log";
    drop policy if exists "inspection_log_update_all" on "public"."inspection_log";
  end if;
end $$;

drop policy "invoice_items_delete_all" on "public"."invoice_items";

drop policy "invoice_items_insert_all" on "public"."invoice_items";

drop policy "invoice_items_select_all" on "public"."invoice_items";

drop policy "invoice_items_update_all" on "public"."invoice_items";

drop policy "invoice_payments_delete_all" on "public"."invoice_payments";

drop policy "invoice_payments_insert_all" on "public"."invoice_payments";

drop policy "invoice_payments_select_all" on "public"."invoice_payments";

drop policy "invoice_payments_update_all" on "public"."invoice_payments";

drop policy "labor_entries_delete_all" on "public"."labor_entries";

drop policy "labor_entries_insert_all" on "public"."labor_entries";

drop policy "labor_entries_select_all" on "public"."labor_entries";

drop policy "labor_entries_update_all" on "public"."labor_entries";

drop policy "labor_payments_delete_all" on "public"."labor_payments";

drop policy "labor_payments_insert_all" on "public"."labor_payments";

drop policy "labor_payments_select_all" on "public"."labor_payments";

drop policy "labor_payments_update_all" on "public"."labor_payments";

do $$
begin
  if to_regclass('public.material_catalog') is not null then
    drop policy if exists "material_catalog_delete_all" on "public"."material_catalog";
    drop policy if exists "material_catalog_insert_all" on "public"."material_catalog";
    drop policy if exists "material_catalog_select_all" on "public"."material_catalog";
    drop policy if exists "material_catalog_update_all" on "public"."material_catalog";
  end if;
end $$;

drop policy "payment_methods_perm_delete" on "public"."payment_methods";

drop policy "payment_methods_perm_insert" on "public"."payment_methods";

drop policy "payment_methods_perm_select" on "public"."payment_methods";

drop policy "payment_methods_perm_update" on "public"."payment_methods";

drop policy "payment_schedule_template_items_delete_all" on "public"."payment_schedule_template_items";

drop policy "payment_schedule_template_items_insert_all" on "public"."payment_schedule_template_items";

drop policy "payment_schedule_template_items_select_all" on "public"."payment_schedule_template_items";

drop policy "payment_schedule_template_items_update_all" on "public"."payment_schedule_template_items";

drop policy "payment_schedule_templates_delete_all" on "public"."payment_schedule_templates";

drop policy "payment_schedule_templates_insert_all" on "public"."payment_schedule_templates";

drop policy "payment_schedule_templates_select_all" on "public"."payment_schedule_templates";

drop policy "payment_schedule_templates_update_all" on "public"."payment_schedule_templates";

drop policy "profiles_select_all_owner" on "public"."profiles";

drop policy "profiles_select_own" on "public"."profiles";

drop policy "profiles_update_owner" on "public"."profiles";

drop policy "project_change_order_attachments_delete_all" on "public"."project_change_order_attachments";

drop policy "project_change_order_attachments_insert_all" on "public"."project_change_order_attachments";

drop policy "project_change_order_attachments_select_all" on "public"."project_change_order_attachments";

drop policy "project_change_order_attachments_update_all" on "public"."project_change_order_attachments";

do $$
begin
  if to_regclass('public.project_closeout_completion') is not null then
    drop policy if exists "project_closeout_completion_insert" on "public"."project_closeout_completion";
    drop policy if exists "project_closeout_completion_select" on "public"."project_closeout_completion";
    drop policy if exists "project_closeout_completion_update" on "public"."project_closeout_completion";
  end if;
  if to_regclass('public.project_closeout_punch') is not null then
    drop policy if exists "project_closeout_punch_insert" on "public"."project_closeout_punch";
    drop policy if exists "project_closeout_punch_select" on "public"."project_closeout_punch";
    drop policy if exists "project_closeout_punch_update" on "public"."project_closeout_punch";
  end if;
  if to_regclass('public.project_closeout_warranty') is not null then
    drop policy if exists "project_closeout_warranty_insert" on "public"."project_closeout_warranty";
    drop policy if exists "project_closeout_warranty_select" on "public"."project_closeout_warranty";
    drop policy if exists "project_closeout_warranty_update" on "public"."project_closeout_warranty";
  end if;
  if to_regclass('public.project_commissions') is not null then
    drop policy if exists "project_commissions_delete" on "public"."project_commissions";
    drop policy if exists "project_commissions_insert" on "public"."project_commissions";
    drop policy if exists "project_commissions_select" on "public"."project_commissions";
    drop policy if exists "project_commissions_update" on "public"."project_commissions";
  end if;
end $$;

do $$
begin
  if to_regclass('public.project_material_selections') is not null then
    drop policy if exists "project_material_selections_delete_all" on "public"."project_material_selections";
    drop policy if exists "project_material_selections_insert_all" on "public"."project_material_selections";
    drop policy if exists "project_material_selections_select_all" on "public"."project_material_selections";
    drop policy if exists "project_material_selections_update_all" on "public"."project_material_selections";
  end if;
end $$;

drop policy "project_schedule_delete_all" on "public"."project_schedule";

drop policy "project_schedule_insert_all" on "public"."project_schedule";

drop policy "project_schedule_select_all" on "public"."project_schedule";

drop policy "project_schedule_update_all" on "public"."project_schedule";

drop policy "project_subcontractors_perm_delete" on "public"."project_subcontractors";

drop policy "project_subcontractors_perm_insert" on "public"."project_subcontractors";

drop policy "project_subcontractors_perm_select" on "public"."project_subcontractors";

drop policy "project_subcontractors_perm_update" on "public"."project_subcontractors";

drop policy "projects_perm_delete" on "public"."projects";

drop policy "projects_perm_insert" on "public"."projects";

drop policy "projects_perm_select" on "public"."projects";

drop policy "projects_perm_update" on "public"."projects";

do $$
begin
  if to_regclass('public.punch_list') is not null then
    drop policy if exists "punch_list_delete_all" on "public"."punch_list";
    drop policy if exists "punch_list_insert_all" on "public"."punch_list";
    drop policy if exists "punch_list_select_all" on "public"."punch_list";
    drop policy if exists "punch_list_update_all" on "public"."punch_list";
  end if;
end $$;

drop policy "role_permissions_owner_select" on "public"."role_permissions";

drop policy "role_permissions_owner_write" on "public"."role_permissions";

do $$
begin
  if to_regclass('public.site_photos') is not null then
    drop policy if exists "site_photos_delete_all" on "public"."site_photos";
    drop policy if exists "site_photos_insert_all" on "public"."site_photos";
    drop policy if exists "site_photos_select_all" on "public"."site_photos";
    drop policy if exists "site_photos_update_all" on "public"."site_photos";
  end if;
end $$;

drop policy "subcontractors_perm_delete" on "public"."subcontractors";

drop policy "subcontractors_perm_insert" on "public"."subcontractors";

drop policy "subcontractors_perm_select" on "public"."subcontractors";

drop policy "subcontractors_perm_update" on "public"."subcontractors";

drop policy "vendors_perm_delete" on "public"."vendors";

drop policy "vendors_perm_insert" on "public"."vendors";

drop policy "vendors_perm_select" on "public"."vendors";

drop policy "vendors_perm_update" on "public"."vendors";

drop policy "worker_advances_delete_all" on "public"."worker_advances";

drop policy "worker_advances_insert_all" on "public"."worker_advances";

drop policy "worker_advances_select_all" on "public"."worker_advances";

drop policy "worker_advances_update_all" on "public"."worker_advances";

drop policy "worker_receipts_delete" on "public"."worker_receipts";

drop policy "worker_receipts_insert" on "public"."worker_receipts";

drop policy "worker_receipts_select" on "public"."worker_receipts";

drop policy "worker_receipts_update" on "public"."worker_receipts";

revoke delete on table "public"."ap_bill_payments" from "anon";

revoke insert on table "public"."ap_bill_payments" from "anon";

revoke references on table "public"."ap_bill_payments" from "anon";

revoke select on table "public"."ap_bill_payments" from "anon";

revoke trigger on table "public"."ap_bill_payments" from "anon";

revoke truncate on table "public"."ap_bill_payments" from "anon";

revoke update on table "public"."ap_bill_payments" from "anon";

revoke delete on table "public"."ap_bill_payments" from "authenticated";

revoke insert on table "public"."ap_bill_payments" from "authenticated";

revoke references on table "public"."ap_bill_payments" from "authenticated";

revoke select on table "public"."ap_bill_payments" from "authenticated";

revoke trigger on table "public"."ap_bill_payments" from "authenticated";

revoke truncate on table "public"."ap_bill_payments" from "authenticated";

revoke update on table "public"."ap_bill_payments" from "authenticated";

revoke delete on table "public"."ap_bill_payments" from "service_role";

revoke insert on table "public"."ap_bill_payments" from "service_role";

revoke references on table "public"."ap_bill_payments" from "service_role";

revoke select on table "public"."ap_bill_payments" from "service_role";

revoke trigger on table "public"."ap_bill_payments" from "service_role";

revoke truncate on table "public"."ap_bill_payments" from "service_role";

revoke update on table "public"."ap_bill_payments" from "service_role";

revoke delete on table "public"."ap_bills" from "anon";

revoke insert on table "public"."ap_bills" from "anon";

revoke references on table "public"."ap_bills" from "anon";

revoke select on table "public"."ap_bills" from "anon";

revoke trigger on table "public"."ap_bills" from "anon";

revoke truncate on table "public"."ap_bills" from "anon";

revoke update on table "public"."ap_bills" from "anon";

revoke delete on table "public"."ap_bills" from "authenticated";

revoke insert on table "public"."ap_bills" from "authenticated";

revoke references on table "public"."ap_bills" from "authenticated";

revoke select on table "public"."ap_bills" from "authenticated";

revoke trigger on table "public"."ap_bills" from "authenticated";

revoke truncate on table "public"."ap_bills" from "authenticated";

revoke update on table "public"."ap_bills" from "authenticated";

revoke delete on table "public"."ap_bills" from "service_role";

revoke insert on table "public"."ap_bills" from "service_role";

revoke references on table "public"."ap_bills" from "service_role";

revoke select on table "public"."ap_bills" from "service_role";

revoke trigger on table "public"."ap_bills" from "service_role";

revoke truncate on table "public"."ap_bills" from "service_role";

revoke update on table "public"."ap_bills" from "service_role";

revoke delete on table "public"."attachments" from "anon";

revoke insert on table "public"."attachments" from "anon";

revoke references on table "public"."attachments" from "anon";

revoke select on table "public"."attachments" from "anon";

revoke trigger on table "public"."attachments" from "anon";

revoke truncate on table "public"."attachments" from "anon";

revoke update on table "public"."attachments" from "anon";

revoke delete on table "public"."attachments" from "authenticated";

revoke insert on table "public"."attachments" from "authenticated";

revoke references on table "public"."attachments" from "authenticated";

revoke select on table "public"."attachments" from "authenticated";

revoke trigger on table "public"."attachments" from "authenticated";

revoke truncate on table "public"."attachments" from "authenticated";

revoke update on table "public"."attachments" from "authenticated";

revoke delete on table "public"."attachments" from "service_role";

revoke insert on table "public"."attachments" from "service_role";

revoke references on table "public"."attachments" from "service_role";

revoke select on table "public"."attachments" from "service_role";

revoke trigger on table "public"."attachments" from "service_role";

revoke truncate on table "public"."attachments" from "service_role";

revoke update on table "public"."attachments" from "service_role";

revoke delete on table "public"."bank_transactions" from "anon";

revoke insert on table "public"."bank_transactions" from "anon";

revoke references on table "public"."bank_transactions" from "anon";

revoke select on table "public"."bank_transactions" from "anon";

revoke trigger on table "public"."bank_transactions" from "anon";

revoke truncate on table "public"."bank_transactions" from "anon";

revoke update on table "public"."bank_transactions" from "anon";

revoke delete on table "public"."bank_transactions" from "authenticated";

revoke insert on table "public"."bank_transactions" from "authenticated";

revoke references on table "public"."bank_transactions" from "authenticated";

revoke select on table "public"."bank_transactions" from "authenticated";

revoke trigger on table "public"."bank_transactions" from "authenticated";

revoke truncate on table "public"."bank_transactions" from "authenticated";

revoke update on table "public"."bank_transactions" from "authenticated";

revoke delete on table "public"."bank_transactions" from "service_role";

revoke insert on table "public"."bank_transactions" from "service_role";

revoke references on table "public"."bank_transactions" from "service_role";

revoke select on table "public"."bank_transactions" from "service_role";

revoke trigger on table "public"."bank_transactions" from "service_role";

revoke truncate on table "public"."bank_transactions" from "service_role";

revoke update on table "public"."bank_transactions" from "service_role";

revoke delete on table "public"."bill_items" from "anon";

revoke insert on table "public"."bill_items" from "anon";

revoke references on table "public"."bill_items" from "anon";

revoke select on table "public"."bill_items" from "anon";

revoke trigger on table "public"."bill_items" from "anon";

revoke truncate on table "public"."bill_items" from "anon";

revoke update on table "public"."bill_items" from "anon";

revoke delete on table "public"."bill_items" from "authenticated";

revoke insert on table "public"."bill_items" from "authenticated";

revoke references on table "public"."bill_items" from "authenticated";

revoke select on table "public"."bill_items" from "authenticated";

revoke trigger on table "public"."bill_items" from "authenticated";

revoke truncate on table "public"."bill_items" from "authenticated";

revoke update on table "public"."bill_items" from "authenticated";

revoke delete on table "public"."bill_items" from "service_role";

revoke insert on table "public"."bill_items" from "service_role";

revoke references on table "public"."bill_items" from "service_role";

revoke select on table "public"."bill_items" from "service_role";

revoke trigger on table "public"."bill_items" from "service_role";

revoke truncate on table "public"."bill_items" from "service_role";

revoke update on table "public"."bill_items" from "service_role";

revoke delete on table "public"."bill_payments" from "anon";

revoke insert on table "public"."bill_payments" from "anon";

revoke references on table "public"."bill_payments" from "anon";

revoke select on table "public"."bill_payments" from "anon";

revoke trigger on table "public"."bill_payments" from "anon";

revoke truncate on table "public"."bill_payments" from "anon";

revoke update on table "public"."bill_payments" from "anon";

revoke delete on table "public"."bill_payments" from "authenticated";

revoke insert on table "public"."bill_payments" from "authenticated";

revoke references on table "public"."bill_payments" from "authenticated";

revoke select on table "public"."bill_payments" from "authenticated";

revoke trigger on table "public"."bill_payments" from "authenticated";

revoke truncate on table "public"."bill_payments" from "authenticated";

revoke update on table "public"."bill_payments" from "authenticated";

revoke delete on table "public"."bill_payments" from "service_role";

revoke insert on table "public"."bill_payments" from "service_role";

revoke references on table "public"."bill_payments" from "service_role";

revoke select on table "public"."bill_payments" from "service_role";

revoke trigger on table "public"."bill_payments" from "service_role";

revoke truncate on table "public"."bill_payments" from "service_role";

revoke update on table "public"."bill_payments" from "service_role";

revoke delete on table "public"."categories" from "anon";

revoke insert on table "public"."categories" from "anon";

revoke references on table "public"."categories" from "anon";

revoke select on table "public"."categories" from "anon";

revoke trigger on table "public"."categories" from "anon";

revoke truncate on table "public"."categories" from "anon";

revoke update on table "public"."categories" from "anon";

revoke delete on table "public"."categories" from "authenticated";

revoke insert on table "public"."categories" from "authenticated";

revoke references on table "public"."categories" from "authenticated";

revoke select on table "public"."categories" from "authenticated";

revoke trigger on table "public"."categories" from "authenticated";

revoke truncate on table "public"."categories" from "authenticated";

revoke update on table "public"."categories" from "authenticated";

revoke delete on table "public"."categories" from "service_role";

revoke insert on table "public"."categories" from "service_role";

revoke references on table "public"."categories" from "service_role";

revoke select on table "public"."categories" from "service_role";

revoke trigger on table "public"."categories" from "service_role";

revoke truncate on table "public"."categories" from "service_role";

revoke update on table "public"."categories" from "service_role";

revoke delete on table "public"."estimate_payment_schedule" from "anon";

revoke insert on table "public"."estimate_payment_schedule" from "anon";

revoke references on table "public"."estimate_payment_schedule" from "anon";

revoke select on table "public"."estimate_payment_schedule" from "anon";

revoke trigger on table "public"."estimate_payment_schedule" from "anon";

revoke truncate on table "public"."estimate_payment_schedule" from "anon";

revoke update on table "public"."estimate_payment_schedule" from "anon";

revoke delete on table "public"."estimate_payment_schedule" from "authenticated";

revoke insert on table "public"."estimate_payment_schedule" from "authenticated";

revoke references on table "public"."estimate_payment_schedule" from "authenticated";

revoke select on table "public"."estimate_payment_schedule" from "authenticated";

revoke trigger on table "public"."estimate_payment_schedule" from "authenticated";

revoke truncate on table "public"."estimate_payment_schedule" from "authenticated";

revoke update on table "public"."estimate_payment_schedule" from "authenticated";

revoke delete on table "public"."estimate_payment_schedule" from "service_role";

revoke insert on table "public"."estimate_payment_schedule" from "service_role";

revoke references on table "public"."estimate_payment_schedule" from "service_role";

revoke select on table "public"."estimate_payment_schedule" from "service_role";

revoke trigger on table "public"."estimate_payment_schedule" from "service_role";

revoke truncate on table "public"."estimate_payment_schedule" from "service_role";

revoke update on table "public"."estimate_payment_schedule" from "service_role";

revoke delete on table "public"."payment_methods" from "anon";

revoke insert on table "public"."payment_methods" from "anon";

revoke references on table "public"."payment_methods" from "anon";

revoke select on table "public"."payment_methods" from "anon";

revoke trigger on table "public"."payment_methods" from "anon";

revoke truncate on table "public"."payment_methods" from "anon";

revoke update on table "public"."payment_methods" from "anon";

revoke delete on table "public"."payment_methods" from "authenticated";

revoke insert on table "public"."payment_methods" from "authenticated";

revoke references on table "public"."payment_methods" from "authenticated";

revoke select on table "public"."payment_methods" from "authenticated";

revoke trigger on table "public"."payment_methods" from "authenticated";

revoke truncate on table "public"."payment_methods" from "authenticated";

revoke update on table "public"."payment_methods" from "authenticated";

revoke delete on table "public"."payment_methods" from "service_role";

revoke insert on table "public"."payment_methods" from "service_role";

revoke references on table "public"."payment_methods" from "service_role";

revoke select on table "public"."payment_methods" from "service_role";

revoke trigger on table "public"."payment_methods" from "service_role";

revoke truncate on table "public"."payment_methods" from "service_role";

revoke update on table "public"."payment_methods" from "service_role";

revoke delete on table "public"."payment_schedule_template_items" from "anon";

revoke insert on table "public"."payment_schedule_template_items" from "anon";

revoke references on table "public"."payment_schedule_template_items" from "anon";

revoke select on table "public"."payment_schedule_template_items" from "anon";

revoke trigger on table "public"."payment_schedule_template_items" from "anon";

revoke truncate on table "public"."payment_schedule_template_items" from "anon";

revoke update on table "public"."payment_schedule_template_items" from "anon";

revoke delete on table "public"."payment_schedule_template_items" from "authenticated";

revoke insert on table "public"."payment_schedule_template_items" from "authenticated";

revoke references on table "public"."payment_schedule_template_items" from "authenticated";

revoke select on table "public"."payment_schedule_template_items" from "authenticated";

revoke trigger on table "public"."payment_schedule_template_items" from "authenticated";

revoke truncate on table "public"."payment_schedule_template_items" from "authenticated";

revoke update on table "public"."payment_schedule_template_items" from "authenticated";

revoke delete on table "public"."payment_schedule_template_items" from "service_role";

revoke insert on table "public"."payment_schedule_template_items" from "service_role";

revoke references on table "public"."payment_schedule_template_items" from "service_role";

revoke select on table "public"."payment_schedule_template_items" from "service_role";

revoke trigger on table "public"."payment_schedule_template_items" from "service_role";

revoke truncate on table "public"."payment_schedule_template_items" from "service_role";

revoke update on table "public"."payment_schedule_template_items" from "service_role";

revoke delete on table "public"."payment_schedule_templates" from "anon";

revoke insert on table "public"."payment_schedule_templates" from "anon";

revoke references on table "public"."payment_schedule_templates" from "anon";

revoke select on table "public"."payment_schedule_templates" from "anon";

revoke trigger on table "public"."payment_schedule_templates" from "anon";

revoke truncate on table "public"."payment_schedule_templates" from "anon";

revoke update on table "public"."payment_schedule_templates" from "anon";

revoke delete on table "public"."payment_schedule_templates" from "authenticated";

revoke insert on table "public"."payment_schedule_templates" from "authenticated";

revoke references on table "public"."payment_schedule_templates" from "authenticated";

revoke select on table "public"."payment_schedule_templates" from "authenticated";

revoke trigger on table "public"."payment_schedule_templates" from "authenticated";

revoke truncate on table "public"."payment_schedule_templates" from "authenticated";

revoke update on table "public"."payment_schedule_templates" from "authenticated";

revoke delete on table "public"."payment_schedule_templates" from "service_role";

revoke insert on table "public"."payment_schedule_templates" from "service_role";

revoke references on table "public"."payment_schedule_templates" from "service_role";

revoke select on table "public"."payment_schedule_templates" from "service_role";

revoke trigger on table "public"."payment_schedule_templates" from "service_role";

revoke truncate on table "public"."payment_schedule_templates" from "service_role";

revoke update on table "public"."payment_schedule_templates" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke select on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."project_change_order_attachments" from "anon";

revoke insert on table "public"."project_change_order_attachments" from "anon";

revoke references on table "public"."project_change_order_attachments" from "anon";

revoke select on table "public"."project_change_order_attachments" from "anon";

revoke trigger on table "public"."project_change_order_attachments" from "anon";

revoke truncate on table "public"."project_change_order_attachments" from "anon";

revoke update on table "public"."project_change_order_attachments" from "anon";

revoke delete on table "public"."project_change_order_attachments" from "authenticated";

revoke insert on table "public"."project_change_order_attachments" from "authenticated";

revoke references on table "public"."project_change_order_attachments" from "authenticated";

revoke select on table "public"."project_change_order_attachments" from "authenticated";

revoke trigger on table "public"."project_change_order_attachments" from "authenticated";

revoke truncate on table "public"."project_change_order_attachments" from "authenticated";

revoke update on table "public"."project_change_order_attachments" from "authenticated";

revoke delete on table "public"."project_change_order_attachments" from "service_role";

revoke insert on table "public"."project_change_order_attachments" from "service_role";

revoke references on table "public"."project_change_order_attachments" from "service_role";

revoke select on table "public"."project_change_order_attachments" from "service_role";

revoke trigger on table "public"."project_change_order_attachments" from "service_role";

revoke truncate on table "public"."project_change_order_attachments" from "service_role";

revoke update on table "public"."project_change_order_attachments" from "service_role";

revoke delete on table "public"."project_closeout_completion" from "anon";

revoke insert on table "public"."project_closeout_completion" from "anon";

revoke references on table "public"."project_closeout_completion" from "anon";

revoke select on table "public"."project_closeout_completion" from "anon";

revoke trigger on table "public"."project_closeout_completion" from "anon";

revoke truncate on table "public"."project_closeout_completion" from "anon";

revoke update on table "public"."project_closeout_completion" from "anon";

revoke delete on table "public"."project_closeout_completion" from "authenticated";

revoke insert on table "public"."project_closeout_completion" from "authenticated";

revoke references on table "public"."project_closeout_completion" from "authenticated";

revoke select on table "public"."project_closeout_completion" from "authenticated";

revoke trigger on table "public"."project_closeout_completion" from "authenticated";

revoke truncate on table "public"."project_closeout_completion" from "authenticated";

revoke update on table "public"."project_closeout_completion" from "authenticated";

revoke delete on table "public"."project_closeout_completion" from "service_role";

revoke insert on table "public"."project_closeout_completion" from "service_role";

revoke references on table "public"."project_closeout_completion" from "service_role";

revoke select on table "public"."project_closeout_completion" from "service_role";

revoke trigger on table "public"."project_closeout_completion" from "service_role";

revoke truncate on table "public"."project_closeout_completion" from "service_role";

revoke update on table "public"."project_closeout_completion" from "service_role";

revoke delete on table "public"."project_closeout_punch" from "anon";

revoke insert on table "public"."project_closeout_punch" from "anon";

revoke references on table "public"."project_closeout_punch" from "anon";

revoke select on table "public"."project_closeout_punch" from "anon";

revoke trigger on table "public"."project_closeout_punch" from "anon";

revoke truncate on table "public"."project_closeout_punch" from "anon";

revoke update on table "public"."project_closeout_punch" from "anon";

revoke delete on table "public"."project_closeout_punch" from "authenticated";

revoke insert on table "public"."project_closeout_punch" from "authenticated";

revoke references on table "public"."project_closeout_punch" from "authenticated";

revoke select on table "public"."project_closeout_punch" from "authenticated";

revoke trigger on table "public"."project_closeout_punch" from "authenticated";

revoke truncate on table "public"."project_closeout_punch" from "authenticated";

revoke update on table "public"."project_closeout_punch" from "authenticated";

revoke delete on table "public"."project_closeout_punch" from "service_role";

revoke insert on table "public"."project_closeout_punch" from "service_role";

revoke references on table "public"."project_closeout_punch" from "service_role";

revoke select on table "public"."project_closeout_punch" from "service_role";

revoke trigger on table "public"."project_closeout_punch" from "service_role";

revoke truncate on table "public"."project_closeout_punch" from "service_role";

revoke update on table "public"."project_closeout_punch" from "service_role";

revoke delete on table "public"."project_closeout_warranty" from "anon";

revoke insert on table "public"."project_closeout_warranty" from "anon";

revoke references on table "public"."project_closeout_warranty" from "anon";

revoke select on table "public"."project_closeout_warranty" from "anon";

revoke trigger on table "public"."project_closeout_warranty" from "anon";

revoke truncate on table "public"."project_closeout_warranty" from "anon";

revoke update on table "public"."project_closeout_warranty" from "anon";

revoke delete on table "public"."project_closeout_warranty" from "authenticated";

revoke insert on table "public"."project_closeout_warranty" from "authenticated";

revoke references on table "public"."project_closeout_warranty" from "authenticated";

revoke select on table "public"."project_closeout_warranty" from "authenticated";

revoke trigger on table "public"."project_closeout_warranty" from "authenticated";

revoke truncate on table "public"."project_closeout_warranty" from "authenticated";

revoke update on table "public"."project_closeout_warranty" from "authenticated";

revoke delete on table "public"."project_closeout_warranty" from "service_role";

revoke insert on table "public"."project_closeout_warranty" from "service_role";

revoke references on table "public"."project_closeout_warranty" from "service_role";

revoke select on table "public"."project_closeout_warranty" from "service_role";

revoke trigger on table "public"."project_closeout_warranty" from "service_role";

revoke truncate on table "public"."project_closeout_warranty" from "service_role";

revoke update on table "public"."project_closeout_warranty" from "service_role";

revoke delete on table "public"."project_subcontractors" from "anon";

revoke insert on table "public"."project_subcontractors" from "anon";

revoke references on table "public"."project_subcontractors" from "anon";

revoke select on table "public"."project_subcontractors" from "anon";

revoke trigger on table "public"."project_subcontractors" from "anon";

revoke truncate on table "public"."project_subcontractors" from "anon";

revoke update on table "public"."project_subcontractors" from "anon";

revoke delete on table "public"."project_subcontractors" from "authenticated";

revoke insert on table "public"."project_subcontractors" from "authenticated";

revoke references on table "public"."project_subcontractors" from "authenticated";

revoke select on table "public"."project_subcontractors" from "authenticated";

revoke trigger on table "public"."project_subcontractors" from "authenticated";

revoke truncate on table "public"."project_subcontractors" from "authenticated";

revoke update on table "public"."project_subcontractors" from "authenticated";

revoke delete on table "public"."project_subcontractors" from "service_role";

revoke insert on table "public"."project_subcontractors" from "service_role";

revoke references on table "public"."project_subcontractors" from "service_role";

revoke select on table "public"."project_subcontractors" from "service_role";

revoke trigger on table "public"."project_subcontractors" from "service_role";

revoke truncate on table "public"."project_subcontractors" from "service_role";

revoke update on table "public"."project_subcontractors" from "service_role";

revoke delete on table "public"."role_permissions" from "anon";

revoke insert on table "public"."role_permissions" from "anon";

revoke references on table "public"."role_permissions" from "anon";

revoke select on table "public"."role_permissions" from "anon";

revoke trigger on table "public"."role_permissions" from "anon";

revoke truncate on table "public"."role_permissions" from "anon";

revoke update on table "public"."role_permissions" from "anon";

revoke delete on table "public"."role_permissions" from "authenticated";

revoke insert on table "public"."role_permissions" from "authenticated";

revoke references on table "public"."role_permissions" from "authenticated";

revoke select on table "public"."role_permissions" from "authenticated";

revoke trigger on table "public"."role_permissions" from "authenticated";

revoke truncate on table "public"."role_permissions" from "authenticated";

revoke update on table "public"."role_permissions" from "authenticated";

revoke delete on table "public"."role_permissions" from "service_role";

revoke insert on table "public"."role_permissions" from "service_role";

revoke references on table "public"."role_permissions" from "service_role";

revoke select on table "public"."role_permissions" from "service_role";

revoke trigger on table "public"."role_permissions" from "service_role";

revoke truncate on table "public"."role_permissions" from "service_role";

revoke update on table "public"."role_permissions" from "service_role";

alter table "public"."accounts" drop constraint "accounts_type_check";

alter table "public"."ap_bill_payments" drop constraint "ap_bill_payments_bill_id_fkey";

alter table "public"."ap_bills" drop constraint "ap_bills_bill_type_check";

alter table "public"."ap_bills" drop constraint "ap_bills_project_id_fkey";

alter table "public"."ap_bills" drop constraint "ap_bills_status_check";

alter table "public"."attachments" drop constraint "attachments_entity_type_check";

alter table "public"."bank_transactions" drop constraint "bank_transactions_linked_expense_id_fkey";

alter table "public"."bank_transactions" drop constraint "bank_transactions_reconcile_type_check";

alter table "public"."bank_transactions" drop constraint "bank_transactions_status_check";

alter table "public"."bill_items" drop constraint "bill_items_bill_id_fkey";

alter table "public"."bill_items" drop constraint "bill_items_project_id_fkey";

alter table "public"."bill_payments" drop constraint "bill_payments_bill_id_fkey";

alter table "public"."bills" drop constraint "bills_category_id_fkey";

alter table "public"."bills" drop constraint "bills_status_check";

alter table "public"."bills" drop constraint "bills_subcontractor_id_fkey";

alter table "public"."categories" drop constraint "categories_status_check";

alter table "public"."categories" drop constraint "categories_type_check";

alter table "public"."commitments" drop constraint "commitments_commitment_type_check";

alter table "public"."commitments" drop constraint "commitments_status_check";

alter table "public"."customers" drop constraint "customers_status_check";

alter table "public"."daily_work_entries" drop constraint "daily_work_entries_day_type_check";

alter table "public"."documents" drop constraint "documents_file_type_check";

alter table "public"."estimate_payment_schedule" drop constraint "estimate_payment_schedule_amount_type_check";

alter table "public"."estimate_payment_schedule" drop constraint "estimate_payment_schedule_estimate_id_fkey";

alter table "public"."estimate_payment_schedule" drop constraint "estimate_payment_schedule_status_check";

alter table "public"."estimate_snapshots" drop constraint "estimate_snapshots_estimate_version_unique";

alter table "public"."expense_lines" drop constraint "expense_lines_project_id_fkey";

alter table "public"."expenses" drop constraint "expenses_account_id_fkey";

alter table "public"."expenses" drop constraint "expenses_status_check";

alter table "public"."expenses" drop constraint "expenses_worker_id_fkey";

alter table "public"."invoice_payments" drop constraint "invoice_payments_status_check";

alter table "public"."invoices" drop constraint "invoices_invoice_no_key";

alter table "public"."invoices" drop constraint "invoices_status_check";

alter table "public"."labor_entries" drop constraint "labor_entries_project_am_id_fkey";

alter table "public"."labor_entries" drop constraint "labor_entries_project_pm_id_fkey";

alter table "public"."labor_entries" drop constraint "labor_entries_status_check";

alter table "public"."payment_methods" drop constraint "payment_methods_name_key";

alter table "public"."payment_methods" drop constraint "payment_methods_status_check";

alter table "public"."payment_schedule_template_items" drop constraint "payment_schedule_template_items_amount_type_check";

alter table "public"."payment_schedule_template_items" drop constraint "payment_schedule_template_items_template_id_fkey";

alter table "public"."payments_received" drop constraint "payments_received_invoice_id_fkey";

alter table "public"."profiles" drop constraint "profiles_id_fkey";

alter table "public"."profiles" drop constraint "profiles_role_check";

alter table "public"."project_change_order_attachments" drop constraint "project_change_order_attachments_change_order_id_fkey";

alter table "public"."project_change_orders" drop constraint "project_change_orders_status_check";

alter table "public"."project_closeout_completion" drop constraint "project_closeout_completion_project_id_fkey";

alter table "public"."project_closeout_completion" drop constraint "project_closeout_completion_project_id_key";

alter table "public"."project_closeout_punch" drop constraint "project_closeout_punch_project_id_fkey";

alter table "public"."project_closeout_punch" drop constraint "project_closeout_punch_project_id_key";

alter table "public"."project_closeout_warranty" drop constraint "project_closeout_warranty_project_id_fkey";

alter table "public"."project_closeout_warranty" drop constraint "project_closeout_warranty_project_id_key";

alter table "public"."project_material_selections" drop constraint "project_material_selections_material_id_fkey";

alter table "public"."project_subcontractors" drop constraint "project_subcontractors_project_id_fkey";

alter table "public"."project_subcontractors" drop constraint "project_subcontractors_rate_type_check";

alter table "public"."project_subcontractors" drop constraint "project_subcontractors_subcontractor_id_fkey";

alter table "public"."project_subcontractors" drop constraint "project_subcontractors_unique";

alter table "public"."project_tasks" drop constraint "project_tasks_priority_check";

alter table "public"."project_tasks" drop constraint "project_tasks_status_check";

alter table "public"."projects" drop constraint "projects_source_estimate_id_unique";

alter table "public"."projects" drop constraint "projects_status_check";

alter table "public"."punch_list" drop constraint "punch_list_photo_id_fkey";

alter table "public"."role_permissions" drop constraint "role_permissions_role_check";

alter table "public"."subcontractors" drop constraint "subcontractors_status_check";

alter table "public"."subcontracts" drop constraint "subcontracts_status_check";

alter table "public"."vendors" drop constraint "vendors_status_check";

alter table "public"."worker_receipts" drop constraint "worker_receipts_project_id_fkey";

alter table "public"."worker_reimbursements" drop constraint "worker_reimbursements_payment_id_fkey";

alter table "public"."workers" drop constraint "workers_status_check_v2";

alter table "public"."bills" drop constraint "bills_project_id_fkey";

alter table "public"."bills" drop constraint "bills_vendor_id_fkey";

alter table "public"."commitments" drop constraint "commitments_project_id_fkey";

alter table "public"."daily_work_entries" drop constraint "daily_work_entries_worker_id_fkey";

alter table "public"."deposits" drop constraint "deposits_invoice_id_fkey";

alter table "public"."documents" drop constraint "documents_project_id_fkey";

alter table "public"."expenses" drop constraint "expenses_project_id_fkey";

alter table "public"."invoices" drop constraint "invoices_customer_id_fkey";

alter table "public"."invoices" drop constraint "invoices_project_id_fkey";

alter table "public"."labor_entries" drop constraint "labor_entries_worker_id_fkey";

alter table "public"."labor_payments" drop constraint "labor_payments_worker_id_fkey";

alter table "public"."project_commissions" drop constraint "project_commissions_project_id_fkey";

alter table "public"."project_tasks" drop constraint "project_tasks_assigned_worker_id_fkey";

alter table "public"."punch_list" drop constraint "punch_list_assigned_worker_id_fkey";

alter table "public"."worker_invoices" drop constraint "worker_invoices_worker_id_fkey";

alter table "public"."worker_payments" drop constraint "worker_payments_worker_id_fkey";

alter table "public"."worker_receipts" drop constraint "worker_receipts_worker_id_fkey";

alter table "public"."worker_reimbursements" drop constraint "worker_reimbursements_worker_id_fkey";

drop function if exists "public"."allocate_labor_cost_on_insert"();

drop function if exists "public"."apply_perm_policies"(target_table text, select_expr text, insert_expr text, update_expr text, delete_expr text);

drop function if exists "public"."approve_change_order"(p_change_order_id uuid, p_approved_by text);

drop function if exists "public"."create_expense_with_lines"(p_project_id uuid, p_vendor text, p_category text, p_expense_date date, p_notes text, p_lines jsonb);

drop function if exists "public"."create_subcontract_bill_guard"(p_subcontract_id uuid, p_project_id uuid, p_bill_date date, p_due_date date, p_amount numeric, p_description text);

drop function if exists "public"."enforce_bill_payment_status"();

drop function if exists "public"."get_monthly_payroll_summary"(p_year integer, p_month integer);

drop function if exists "public"."get_my_permissions"();

drop function if exists "public"."get_project_labor_breakdown"(p_project_id uuid);

drop function if exists "public"."handle_new_auth_user"();

drop function if exists "public"."has_perm"(p_key text);

drop function if exists "public"."is_owner"();

drop function if exists "public"."log_activity_expense_line"();

drop function if exists "public"."log_activity_invoice"();

drop function if exists "public"."reallocate_labor_cost"(p_entry_id uuid, p_old_project_am_id uuid, p_old_project_pm_id uuid, p_old_day_rate numeric, p_old_ot_amount numeric);

drop function if exists "public"."recompute_ap_bill_totals"(target_bill_id uuid);

drop function if exists "public"."recompute_ap_bill_totals_trigger"();

drop function if exists "public"."recompute_ap_bill_totals_trigger_amount"();

drop function if exists "public"."recompute_bill_totals"(target_bill_id uuid);

drop function if exists "public"."recompute_expense_totals"(target_expense_id uuid);

drop function if exists "public"."recompute_invoice_totals"(target_invoice_id uuid);

drop function if exists "public"."reset_table_policies"(target_table text);

drop function if exists "public"."set_ap_bills_updated_at"();

drop function if exists "public"."set_bill_item_line_total"();

drop function if exists "public"."set_company_profile_updated_at"();

drop function if exists "public"."set_customers_updated_at"();

drop function if exists "public"."set_invoice_item_amount"();

drop function if exists "public"."set_profiles_updated_at"();

drop function if exists "public"."set_projects_updated_at"();

drop function if exists "public"."sync_worker_to_labor_workers"();

drop function if exists "public"."trg_recompute_bill_totals"();

drop function if exists "public"."trg_recompute_expense_totals"();

drop function if exists "public"."trg_recompute_invoice_totals"();

drop function if exists "public"."upsert_my_profile"();

drop function if exists "public"."void_subcontract_bill"(p_bill_id uuid);

drop view if exists "public"."worker_payable_summary";

alter table "public"."ap_bill_payments" drop constraint "ap_bill_payments_pkey";

alter table "public"."ap_bills" drop constraint "ap_bills_pkey";

alter table "public"."attachments" drop constraint "attachments_pkey";

alter table "public"."bank_transactions" drop constraint "bank_transactions_pkey";

alter table "public"."bill_items" drop constraint "bill_items_pkey";

alter table "public"."bill_payments" drop constraint "bill_payments_pkey";

alter table "public"."categories" drop constraint "categories_pkey";

alter table "public"."estimate_payment_schedule" drop constraint "estimate_payment_schedule_pkey";

alter table "public"."payment_methods" drop constraint "payment_methods_pkey";

alter table "public"."payment_schedule_template_items" drop constraint "payment_schedule_template_items_pkey";

alter table "public"."payment_schedule_templates" drop constraint "payment_schedule_templates_pkey";

alter table "public"."profiles" drop constraint "profiles_pkey";

alter table "public"."project_change_order_attachments" drop constraint "project_change_order_attachments_pkey";

alter table "public"."project_closeout_completion" drop constraint "project_closeout_completion_pkey";

alter table "public"."project_closeout_punch" drop constraint "project_closeout_punch_pkey";

alter table "public"."project_closeout_warranty" drop constraint "project_closeout_warranty_pkey";

alter table "public"."project_subcontractors" drop constraint "project_subcontractors_pkey";

alter table "public"."role_permissions" drop constraint "role_permissions_pkey";

drop index if exists "public"."accounts_name_idx";

drop index if exists "public"."accounts_type_idx";

drop index if exists "public"."ap_bill_payments_pkey";

drop index if exists "public"."ap_bills_pkey";

drop index if exists "public"."attachments_pkey";

drop index if exists "public"."bank_transactions_pkey";

drop index if exists "public"."bill_items_pkey";

drop index if exists "public"."bill_payments_pkey";

drop index if exists "public"."categories_pkey";

drop index if exists "public"."commitments_commitment_date_idx";

drop index if exists "public"."commitments_project_id_idx";

drop index if exists "public"."estimate_categories_estimate_order_idx";

drop index if exists "public"."estimate_payment_schedule_estimate_id_idx";

drop index if exists "public"."estimate_payment_schedule_pkey";

drop index if exists "public"."estimate_snapshots_estimate_id_idx";

drop index if exists "public"."estimate_snapshots_estimate_version_idx";

drop index if exists "public"."estimate_snapshots_estimate_version_unique";

drop index if exists "public"."idx_ap_bill_payments_bill_id";

drop index if exists "public"."idx_ap_bills_created_at";

drop index if exists "public"."idx_ap_bills_due_date";

drop index if exists "public"."idx_ap_bills_project_id";

drop index if exists "public"."idx_ap_bills_status";

drop index if exists "public"."idx_commission_payment_records_commission_id";

drop index if exists "public"."idx_commission_payment_records_payment_date";

drop index if exists "public"."idx_commission_payment_records_project_id";

drop index if exists "public"."idx_daily_work_entries_project_id";

drop index if exists "public"."idx_daily_work_entries_work_date";

drop index if exists "public"."idx_daily_work_entries_worker_id";

drop index if exists "public"."idx_deposits_deposit_date";

drop index if exists "public"."idx_deposits_invoice_id";

drop index if exists "public"."idx_deposits_payment_id";

drop index if exists "public"."idx_deposits_project_id";

drop index if exists "public"."idx_documents_file_name_lower";

drop index if exists "public"."idx_documents_file_type";

drop index if exists "public"."idx_documents_project_id";

drop index if exists "public"."idx_documents_related";

drop index if exists "public"."idx_documents_uploaded_at";

drop index if exists "public"."idx_expense_lines_expense_id";

drop index if exists "public"."idx_expenses_created_at";

drop index if exists "public"."idx_expenses_expense_date";

drop index if exists "public"."idx_expenses_project_id";

drop index if exists "public"."idx_expenses_source_source_id";

drop index if exists "public"."idx_inspection_log_inspection_date";

drop index if exists "public"."idx_inspection_log_project_id";

drop index if exists "public"."idx_inspection_log_status";

drop index if exists "public"."idx_labor_entries_status";

drop index if exists "public"."idx_labor_entries_work_date";

drop index if exists "public"."idx_labor_entries_worker_id";

drop index if exists "public"."idx_labor_invoices_created_at";

drop index if exists "public"."idx_labor_invoices_status";

drop index if exists "public"."idx_labor_payments_payment_date";

drop index if exists "public"."idx_labor_payments_worker_id";

drop index if exists "public"."idx_material_catalog_category";

drop index if exists "public"."idx_material_catalog_name";

drop index if exists "public"."idx_payments_received_invoice_id";

drop index if exists "public"."idx_payments_received_payment_date";

drop index if exists "public"."idx_payments_received_project_id";

drop index if exists "public"."idx_project_closeout_completion_project_id";

drop index if exists "public"."idx_project_closeout_punch_project_id";

drop index if exists "public"."idx_project_closeout_warranty_project_id";

drop index if exists "public"."idx_project_commissions_project_id";

drop index if exists "public"."idx_project_commissions_status";

drop index if exists "public"."idx_project_material_selections_project_id";

drop index if exists "public"."idx_project_material_selections_status";

drop index if exists "public"."idx_project_schedule_project_id";

drop index if exists "public"."idx_project_schedule_start_date";

drop index if exists "public"."idx_project_tasks_is_test";

drop index if exists "public"."idx_punch_list_created_at";

drop index if exists "public"."idx_punch_list_photo_id";

drop index if exists "public"."idx_punch_list_project_id";

drop index if exists "public"."idx_site_photos_created_at";

drop index if exists "public"."idx_site_photos_project_id";

drop index if exists "public"."idx_worker_invoices_created_at";

drop index if exists "public"."idx_worker_invoices_invoice_date";

drop index if exists "public"."idx_worker_invoices_status";

drop index if exists "public"."idx_worker_invoices_worker_id";

drop index if exists "public"."idx_worker_payments_created_at";

drop index if exists "public"."idx_worker_payments_worker_id";

drop index if exists "public"."idx_worker_receipts_created_at";

drop index if exists "public"."idx_worker_receipts_expense_type";

drop index if exists "public"."idx_worker_receipts_project_id";

drop index if exists "public"."idx_worker_receipts_status";

drop index if exists "public"."idx_worker_reimbursements_created_at";

drop index if exists "public"."idx_worker_reimbursements_date";

drop index if exists "public"."idx_worker_reimbursements_payment_id";

drop index if exists "public"."idx_worker_reimbursements_status";

drop index if exists "public"."idx_worker_reimbursements_worker_id";

drop index if exists "public"."idx_workers_name";

drop index if exists "public"."idx_workers_status";

drop index if exists "public"."invoices_invoice_no_key";

drop index if exists "public"."payment_methods_name_key";

drop index if exists "public"."payment_methods_pkey";

drop index if exists "public"."payment_schedule_template_items_pkey";

drop index if exists "public"."payment_schedule_template_items_template_id_idx";

drop index if exists "public"."payment_schedule_templates_pkey";

drop index if exists "public"."profiles_pkey";

drop index if exists "public"."project_change_order_attachments_change_order_id_idx";

drop index if exists "public"."project_change_order_attachments_pkey";

drop index if exists "public"."project_closeout_completion_pkey";

drop index if exists "public"."project_closeout_completion_project_id_key";

drop index if exists "public"."project_closeout_punch_pkey";

drop index if exists "public"."project_closeout_punch_project_id_key";

drop index if exists "public"."project_closeout_warranty_pkey";

drop index if exists "public"."project_closeout_warranty_project_id_key";

drop index if exists "public"."project_subcontractors_pkey";

drop index if exists "public"."project_subcontractors_unique";

drop index if exists "public"."projects_source_estimate_id_idx";

drop index if exists "public"."projects_source_estimate_id_unique";

drop index if exists "public"."projects_status_idx";

drop index if exists "public"."projects_updated_at_idx";

drop index if exists "public"."role_permissions_pkey";

drop index if exists "public"."worker_advances_advance_date_idx";

drop index if exists "public"."worker_advances_project_id_idx";

drop index if exists "public"."worker_advances_status_idx";

drop index if exists "public"."worker_advances_worker_id_idx";

drop table "public"."ap_bill_payments";

drop table "public"."ap_bills";

drop table "public"."attachments";

drop table "public"."bank_transactions";

drop table "public"."bill_items";

drop table "public"."bill_payments";

drop table "public"."categories";

drop table "public"."estimate_payment_schedule";

drop table "public"."payment_methods";

drop table "public"."payment_schedule_template_items";

drop table "public"."payment_schedule_templates";

drop table "public"."profiles";

drop table "public"."project_change_order_attachments";

drop table "public"."project_closeout_completion";

drop table "public"."project_closeout_punch";

drop table "public"."project_closeout_warranty";

drop table "public"."project_subcontractors";

drop table "public"."role_permissions";


  create table "public"."accounting_periods" (
    "id" uuid not null default gen_random_uuid(),
    "month" date not null,
    "is_locked" boolean default false,
    "locked_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."accounting_periods" enable row level security;


  create table "public"."clients" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "phone" text,
    "email" text,
    "address" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."clients" enable row level security;


  create table "public"."completion_certificates" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "completion_date" date,
    "contractor_name" text,
    "client_name" text,
    "contractor_signature" text,
    "client_signature" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."completion_certificates" enable row level security;


  create table "public"."cost_allocations" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "category" text,
    "amount" numeric,
    "description" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."cost_allocations" enable row level security;


  create table "public"."final_punch_list_items" (
    "id" uuid not null default gen_random_uuid(),
    "punch_list_id" uuid,
    "item" text,
    "status" text default 'pending'::text
      );


alter table "public"."final_punch_list_items" enable row level security;


  create table "public"."final_punch_lists" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "inspection_date" date,
    "inspector" text,
    "notes" text,
    "contractor_signature" text,
    "client_signature" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."final_punch_lists" enable row level security;


  create table "public"."inspection_logs" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "inspection_type" text,
    "inspector" text,
    "inspection_date" date,
    "status" text,
    "notes" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."inspection_logs" enable row level security;


  create table "public"."material_selections" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "category" text,
    "material_name" text,
    "description" text,
    "supplier" text,
    "cost" text,
    "photo_url" text,
    "status" text default 'pending'::text,
    "notes" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."material_selections" enable row level security;


  create table "public"."project_cost_codes" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid not null,
    "code" text not null,
    "name" text not null,
    "budget_amount" numeric default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."project_cost_codes" enable row level security;


  create table "public"."tmp_backup_worker_advances_haijun" (
    "id" uuid,
    "worker_id" uuid,
    "project_id" uuid,
    "amount" numeric(12,2),
    "advance_date" date,
    "status" text,
    "notes" text,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
      );



  create table "public"."warranties" (
    "id" uuid not null default gen_random_uuid(),
    "project_id" uuid,
    "start_date" date,
    "period_months" integer,
    "notes" text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."warranties" enable row level security;

alter table "public"."accounts" add column "user_id" uuid;

alter table "public"."accounts" alter column "created_at" drop not null;

alter table "public"."accounts" alter column "type" set default 'Bank'::text;

alter table "public"."accounts" alter column "type" drop not null;

alter table "public"."accounts" alter column "updated_at" drop not null;

alter table "public"."bills" drop column "amount_paid";

alter table "public"."bills" drop column "balance";

alter table "public"."bills" drop column "bill_date";

alter table "public"."bills" drop column "bill_number";

alter table "public"."bills" drop column "category_id";

alter table "public"."bills" drop column "memo";

alter table "public"."bills" drop column "payee_name";

alter table "public"."bills" drop column "subcontractor_id";

alter table "public"."bills" drop column "subtotal";

alter table "public"."bills" drop column "tax";

alter table "public"."bills" drop column "total";

alter table "public"."bills" drop column "void_reason";

alter table "public"."bills" add column "amount" numeric;

alter table "public"."bills" add column "bill_type" text default 'Vendor'::text;

alter table "public"."bills" add column "category" text;

alter table "public"."bills" add column "issue_date" date;

alter table "public"."bills" add column "notes" text;

alter table "public"."bills" add column "vendor_name" text;

alter table "public"."bills" alter column "created_at" drop not null;

alter table "public"."bills" alter column "status" set default 'unpaid'::text;

alter table "public"."bills" alter column "status" drop not null;

alter table "public"."bills" alter column "updated_at" drop not null;

alter table "public"."commission_payment_records" alter column "amount" set data type numeric(12,2) using "amount"::numeric(12,2);

alter table "public"."commission_payment_records" alter column "commission_id" drop not null;

alter table "public"."commission_payment_records" alter column "payment_date" drop not null;

alter table "public"."commission_payment_records" alter column "payment_method" drop default;

alter table "public"."commission_payment_records" alter column "payment_method" drop not null;

alter table "public"."commission_payment_records" alter column "project_id" drop not null;

alter table "public"."commitments" drop column "amount";

alter table "public"."commitments" drop column "commitment_date";

alter table "public"."commitments" drop column "commitment_type";

alter table "public"."commitments" drop column "created_at";

alter table "public"."commitments" drop column "notes";

alter table "public"."commitments" drop column "updated_at";

alter table "public"."commitments" drop column "vendor_name";

alter table "public"."commitments" add column "budget_code" text;

alter table "public"."commitments" add column "committed_amount" numeric default 0;

alter table "public"."commitments" add column "paid_amount" numeric default 0;

alter table "public"."commitments" add column "vendor" text;

alter table "public"."commitments" alter column "project_id" drop not null;

alter table "public"."commitments" alter column "status" drop not null;

alter table "public"."company_profile" alter column "created_at" drop not null;

alter table "public"."company_profile" alter column "default_tax_pct" drop default;

alter table "public"."company_profile" alter column "updated_at" drop not null;

alter table "public"."customers" add column "city" text;

alter table "public"."customers" add column "state" text;

alter table "public"."customers" add column "zip" text;

alter table "public"."customers" alter column "created_at" drop not null;

alter table "public"."customers" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."customers" alter column "name" set not null;

alter table "public"."customers" alter column "status" drop not null;

alter table "public"."customers" alter column "updated_at" drop not null;

alter table "public"."daily_work_entries" alter column "daily_rate" set default 0;

alter table "public"."daily_work_entries" alter column "daily_rate" set data type numeric(10,2) using "daily_rate"::numeric(10,2);

alter table "public"."daily_work_entries" alter column "day_type" set default 'full_day'::text;

alter table "public"."daily_work_entries" alter column "ot_hours" set data type numeric(10,2) using "ot_hours"::numeric(10,2);

alter table "public"."daily_work_entries" alter column "total_pay" set data type numeric(10,2) using "total_pay"::numeric(10,2);

alter table "public"."daily_work_entries" alter column "worker_id" drop not null;

alter table "public"."deposits" add column "account" text;

alter table "public"."deposits" add column "date" timestamp with time zone default now();

alter table "public"."deposits" add column "description" text;

alter table "public"."deposits" alter column "amount" set data type numeric(12,2) using "amount"::numeric(12,2);

alter table "public"."deposits" alter column "created_at" drop not null;

alter table "public"."deposits" alter column "customer_name" drop default;

alter table "public"."deposits" alter column "customer_name" drop not null;

alter table "public"."deposits" alter column "deposit_date" set default now();

alter table "public"."deposits" alter column "deposit_date" drop not null;

alter table "public"."deposits" alter column "deposit_date" set data type timestamp with time zone using "deposit_date"::timestamp with time zone;

alter table "public"."deposits" alter column "invoice_id" drop not null;

alter table "public"."deposits" alter column "payment_id" drop not null;

alter table "public"."documents" drop column "file_name";

alter table "public"."documents" drop column "file_path";

alter table "public"."documents" drop column "file_type";

alter table "public"."documents" drop column "mime_type";

alter table "public"."documents" drop column "notes";

alter table "public"."documents" drop column "related_id";

alter table "public"."documents" drop column "related_module";

alter table "public"."documents" drop column "size_bytes";

alter table "public"."documents" drop column "uploaded_at";

alter table "public"."documents" drop column "uploaded_by";

alter table "public"."documents" add column "category" text;

alter table "public"."documents" add column "created_at" timestamp with time zone default now();

alter table "public"."documents" add column "file_url" text;

alter table "public"."documents" alter column "name" drop expression;

alter table "public"."estimate_categories" drop column "order_index";

alter table "public"."expense_lines" drop column "category";

alter table "public"."expense_lines" drop column "created_at";

alter table "public"."expense_lines" drop column "memo";

alter table "public"."expense_lines" drop column "name";

alter table "public"."expense_lines" drop column "project_id";

alter table "public"."expense_lines" add column "description" text;

alter table "public"."expense_lines" add column "qty" numeric default 1;

alter table "public"."expense_lines" add column "total" numeric;

alter table "public"."expense_lines" add column "unit_cost" numeric default 0;

alter table "public"."expense_lines" alter column "amount" drop default;

alter table "public"."expense_lines" alter column "amount" drop not null;

alter table "public"."expenses" drop column "name";

alter table "public"."expenses" drop column "receipt_url";

alter table "public"."expenses" drop column "updated_at";

alter table "public"."expenses" add column "amount" numeric not null;

alter table "public"."expenses" add column "category" text;

alter table "public"."expenses" add column "cost_code" text;

alter table "public"."expenses" add column "tax" numeric default 0;

alter table "public"."expenses" add column "vendor_id" uuid;

alter table "public"."expenses" alter column "created_at" drop not null;

alter table "public"."expenses" alter column "expense_date" drop default;

alter table "public"."expenses" alter column "expense_date" drop not null;

alter table "public"."expenses" alter column "line_count" drop not null;

alter table "public"."expenses" alter column "payment_method" drop default;

alter table "public"."expenses" alter column "payment_method" drop not null;

alter table "public"."expenses" alter column "source_id" set data type uuid using "source_id"::uuid;

alter table "public"."expenses" alter column "status" set default 'Draft'::text;

alter table "public"."expenses" alter column "status" drop not null;

alter table "public"."expenses" alter column "total" drop default;

alter table "public"."expenses" alter column "total" drop not null;

alter table "public"."expenses" alter column "vendor_name" drop default;

alter table "public"."expenses" alter column "vendor_name" drop not null;

alter table "public"."inspection_log" add column "photo_url" text;

alter table "public"."inspection_log" alter column "created_at" drop not null;

alter table "public"."inspection_log" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."inspection_log" alter column "inspection_type" drop default;

alter table "public"."inspection_log" alter column "inspection_type" drop not null;

alter table "public"."inspection_log" alter column "project_id" drop not null;

alter table "public"."inspection_log" alter column "status" drop default;

alter table "public"."inspection_log" alter column "status" drop not null;

alter table "public"."invoice_items" alter column "amount" drop default;

alter table "public"."invoice_items" alter column "amount" drop not null;

alter table "public"."invoice_items" alter column "created_at" drop not null;

alter table "public"."invoice_items" alter column "qty" drop default;

alter table "public"."invoice_items" alter column "qty" drop not null;

alter table "public"."invoice_items" alter column "quantity" set default 1;

alter table "public"."invoice_items" alter column "quantity" set not null;

alter table "public"."invoice_payments" alter column "invoice_id" drop not null;

alter table "public"."invoice_payments" alter column "paid_at" drop default;

alter table "public"."invoice_payments" alter column "paid_at" drop not null;

alter table "public"."invoice_payments" alter column "payment_date" drop expression;

alter table "public"."invoice_payments" alter column "reference" drop expression;

alter table "public"."invoices" drop column "name";

alter table "public"."invoices" alter column "client_name" drop default;

alter table "public"."invoices" alter column "client_name" drop not null;

alter table "public"."invoices" alter column "created_at" drop not null;

alter table "public"."invoices" alter column "due_date" drop default;

alter table "public"."invoices" alter column "due_date" drop not null;

alter table "public"."invoices" alter column "invoice_no" drop not null;

alter table "public"."invoices" alter column "issue_date" drop not null;

alter table "public"."invoices" alter column "status" drop not null;

alter table "public"."invoices" alter column "total" drop not null;

alter table "public"."invoices" alter column "updated_at" drop not null;

alter table "public"."labor_entries" drop column "approved_at";

alter table "public"."labor_entries" drop column "approved_by";

alter table "public"."labor_entries" drop column "created_at";

alter table "public"."labor_entries" drop column "day_rate";

alter table "public"."labor_entries" drop column "locked_at";

alter table "public"."labor_entries" drop column "locked_by";

alter table "public"."labor_entries" drop column "ot_amount";

alter table "public"."labor_entries" drop column "project_am_id";

alter table "public"."labor_entries" drop column "project_pm_id";

alter table "public"."labor_entries" drop column "submitted_at";

alter table "public"."labor_entries" drop column "submitted_by";

alter table "public"."labor_entries" drop column "total";

alter table "public"."labor_entries" alter column "project_id" drop expression;

alter table "public"."labor_entries" alter column "status" set default 'pending'::text;

alter table "public"."labor_entries" alter column "status" drop not null;

alter table "public"."labor_entries" alter column "work_date" drop not null;

alter table "public"."labor_entries" alter column "worker_id" drop not null;

alter table "public"."labor_payments" drop column "applied_end_date";

alter table "public"."labor_payments" drop column "applied_start_date";

alter table "public"."labor_payments" drop column "memo";

alter table "public"."labor_payments" add column "note" text;

alter table "public"."labor_payments" alter column "amount" drop default;

alter table "public"."labor_payments" alter column "created_at" drop not null;

alter table "public"."labor_workers" drop column "created_at";

alter table "public"."labor_workers" add column "active" boolean default true;

alter table "public"."labor_workers" add column "rate" numeric default 0;

alter table "public"."labor_workers" add column "type" text default 'Sub'::text;

alter table "public"."labor_workers" enable row level security;

alter table "public"."material_catalog" alter column "category" drop default;

alter table "public"."material_catalog" alter column "category" drop not null;

alter table "public"."material_catalog" alter column "cost" set data type text using "cost"::text;

alter table "public"."material_catalog" alter column "created_at" drop not null;

alter table "public"."material_catalog" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."material_catalog" alter column "material_name" drop default;

alter table "public"."material_catalog" alter column "material_name" drop not null;

alter table "public"."payments_received" add column "method" text;

alter table "public"."payments_received" alter column "amount" drop default;

alter table "public"."payments_received" alter column "amount" drop not null;

alter table "public"."payments_received" alter column "created_at" drop not null;

alter table "public"."payments_received" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."payments_received" alter column "customer_name" drop default;

alter table "public"."payments_received" alter column "customer_name" drop not null;

alter table "public"."payments_received" alter column "invoice_id" drop not null;

alter table "public"."payments_received" alter column "payment_date" set default now();

alter table "public"."payments_received" alter column "payment_date" drop not null;

alter table "public"."payments_received" alter column "payment_date" set data type timestamp without time zone using "payment_date"::timestamp without time zone;

alter table "public"."project_change_orders" drop column "amount";

alter table "public"."project_change_orders" drop column "cost_impact";

alter table "public"."project_change_orders" drop column "description";

alter table "public"."project_change_orders" drop column "schedule_impact_days";

alter table "public"."project_change_orders" drop column "title";

alter table "public"."project_change_orders" alter column "approved_by" set data type uuid using "approved_by"::uuid;

alter table "public"."project_commissions" alter column "base_amount" drop default;

alter table "public"."project_commissions" alter column "base_amount" drop not null;

alter table "public"."project_commissions" alter column "calculation_mode" drop default;

alter table "public"."project_commissions" alter column "calculation_mode" drop not null;

alter table "public"."project_commissions" alter column "commission_amount" drop default;

alter table "public"."project_commissions" alter column "commission_amount" drop not null;

alter table "public"."project_commissions" alter column "created_at" drop not null;

alter table "public"."project_commissions" alter column "person_name" drop default;

alter table "public"."project_commissions" alter column "person_name" drop not null;

alter table "public"."project_commissions" alter column "project_id" drop not null;

alter table "public"."project_commissions" alter column "rate" drop default;

alter table "public"."project_commissions" alter column "rate" drop not null;

alter table "public"."project_commissions" alter column "role" drop default;

alter table "public"."project_commissions" alter column "role" drop not null;

alter table "public"."project_commissions" alter column "status" set default 'pending'::text;

alter table "public"."project_commissions" alter column "status" drop not null;

alter table "public"."project_material_selections" drop column "category";

alter table "public"."project_material_selections" drop column "item";

alter table "public"."project_material_selections" drop column "material_id";

alter table "public"."project_material_selections" drop column "material_name";

alter table "public"."project_material_selections" drop column "photo_url";

alter table "public"."project_material_selections" drop column "supplier";

alter table "public"."project_material_selections" add column "catalog_id" uuid;

alter table "public"."project_material_selections" add column "item_name" text;

alter table "public"."project_material_selections" alter column "created_at" drop not null;

alter table "public"."project_material_selections" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."project_material_selections" alter column "project_id" drop not null;

alter table "public"."project_material_selections" alter column "status" set default 'pending'::text;

alter table "public"."project_material_selections" alter column "status" drop not null;

alter table "public"."project_schedule" add column "description" text;

alter table "public"."project_schedule" alter column "created_at" drop not null;

alter table "public"."project_schedule" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."project_schedule" alter column "project_id" drop not null;

alter table "public"."project_schedule" alter column "status" set default 'planned'::text;

alter table "public"."project_schedule" alter column "status" drop not null;

alter table "public"."project_schedule" alter column "title" drop default;

alter table "public"."project_tasks" alter column "created_at" drop not null;

alter table "public"."project_tasks" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."project_tasks" alter column "priority" drop not null;

alter table "public"."project_tasks" alter column "project_id" drop not null;

alter table "public"."project_tasks" alter column "status" drop not null;

alter table "public"."project_tasks" alter column "title" drop default;

alter table "public"."projects" add column "city" text;

alter table "public"."projects" add column "client_email" text;

alter table "public"."projects" add column "client_id" uuid;

alter table "public"."projects" add column "client_phone" text;

alter table "public"."projects" add column "contract_amount" numeric(14,2) default 0;

alter table "public"."projects" add column "project_number" text;

alter table "public"."projects" add column "state" text;

alter table "public"."projects" add column "zip_code" text;

alter table "public"."projects" alter column "created_at" drop not null;

alter table "public"."projects" alter column "name" drop default;

alter table "public"."projects" alter column "status" set default 'Active'::text;

alter table "public"."projects" alter column "updated_at" set default now();

alter table "public"."projects" alter column "updated_at" drop not null;

alter table "public"."projects" alter column "updated_at" set data type timestamp with time zone using "updated_at"::timestamp with time zone;

alter table "public"."punch_list" drop column "completed_at";

alter table "public"."punch_list" drop column "description";

alter table "public"."punch_list" drop column "photo_id";

alter table "public"."punch_list" drop column "priority";

alter table "public"."punch_list" alter column "created_at" drop not null;

alter table "public"."punch_list" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."punch_list" alter column "created_by" set data type uuid using "created_by"::uuid;

alter table "public"."punch_list" alter column "issue" drop default;

alter table "public"."punch_list" alter column "issue" drop not null;

alter table "public"."punch_list" alter column "project_id" drop not null;

alter table "public"."punch_list" alter column "status" drop not null;

alter table "public"."site_photos" alter column "created_at" drop not null;

alter table "public"."site_photos" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."site_photos" alter column "photo_url" drop not null;

alter table "public"."site_photos" alter column "project_id" drop not null;

alter table "public"."subcontract_bills" drop column "due_date";

alter table "public"."subcontractors" drop column "address1";

alter table "public"."subcontractors" drop column "address2";

alter table "public"."subcontractors" drop column "city";

alter table "public"."subcontractors" drop column "contact_name";

alter table "public"."subcontractors" drop column "display_name";

alter table "public"."subcontractors" drop column "insurance_expiration";

alter table "public"."subcontractors" drop column "insurance_expiration_date";

alter table "public"."subcontractors" drop column "legal_name";

alter table "public"."subcontractors" drop column "license_number";

alter table "public"."subcontractors" drop column "notes";

alter table "public"."subcontractors" drop column "state";

alter table "public"."subcontractors" drop column "status";

alter table "public"."subcontractors" drop column "tax_id_last4";

alter table "public"."subcontractors" drop column "updated_at";

alter table "public"."subcontractors" drop column "w9_on_file";

alter table "public"."subcontractors" drop column "w9_storage_path";

alter table "public"."subcontractors" drop column "zip";

alter table "public"."subcontractors" add column "active" boolean not null default true;

alter table "public"."subcontractors" add column "address" text;

alter table "public"."subcontractors" add column "name" text not null;

alter table "public"."subcontracts" drop column "retainage_pct";

alter table "public"."subcontracts" drop column "status";

alter table "public"."vendors" drop column "contact_name";

alter table "public"."vendors" drop column "notes";

alter table "public"."vendors" drop column "status";

alter table "public"."vendors" drop column "updated_at";

alter table "public"."vendors" alter column "created_at" drop not null;

alter table "public"."vendors" alter column "created_at" set data type timestamp without time zone using "created_at"::timestamp without time zone;

alter table "public"."vendors" alter column "name" drop not null;

alter table "public"."worker_advances" drop column "created_by";

alter table "public"."worker_advances" add column "updated_at" timestamp with time zone default now();

alter table "public"."worker_advances" alter column "advance_date" drop not null;

alter table "public"."worker_advances" alter column "amount" set default 0;

alter table "public"."worker_advances" alter column "amount" set data type numeric(12,2) using "amount"::numeric(12,2);

alter table "public"."worker_advances" alter column "created_at" drop not null;

alter table "public"."worker_advances" alter column "status" drop not null;

alter table "public"."worker_advances" alter column "worker_id" drop not null;

alter table "public"."worker_invoices" drop column "attachment_url";

alter table "public"."worker_invoices" drop column "invoice_date";

alter table "public"."worker_invoices" drop column "invoice_number";

alter table "public"."worker_invoices" alter column "amount" set not null;

alter table "public"."worker_invoices" alter column "amount" set data type numeric(10,2) using "amount"::numeric(10,2);

alter table "public"."worker_invoices" alter column "worker_id" drop not null;

alter table "public"."worker_payments" drop column "note";

alter table "public"."worker_payments" drop column "total_amount";

alter table "public"."worker_payments" add column "notes" text;

alter table "public"."worker_payments" add column "payment_date" date default CURRENT_DATE;

alter table "public"."worker_payments" add column "project_id" uuid;

alter table "public"."worker_payments" alter column "amount" set default 0;

alter table "public"."worker_payments" alter column "amount" set not null;

alter table "public"."worker_payments" alter column "amount" set data type numeric(10,2) using "amount"::numeric(10,2);

alter table "public"."worker_payments" alter column "worker_id" drop not null;

alter table "public"."worker_receipts" alter column "amount" drop default;

alter table "public"."worker_receipts" alter column "amount" drop not null;

alter table "public"."worker_receipts" alter column "amount" set data type numeric(12,2) using "amount"::numeric(12,2);

alter table "public"."worker_receipts" alter column "created_at" drop not null;

alter table "public"."worker_receipts" alter column "status" drop not null;

alter table "public"."worker_reimbursements" drop column "reimbursement_date";

alter table "public"."worker_reimbursements" add column "approved_at" timestamp without time zone;

alter table "public"."worker_reimbursements" add column "expense_type" text;

alter table "public"."worker_reimbursements" alter column "amount" set default 0;

alter table "public"."worker_reimbursements" alter column "amount" set not null;

alter table "public"."worker_reimbursements" alter column "amount" set data type numeric(10,2) using "amount"::numeric(10,2);

alter table "public"."worker_reimbursements" alter column "paid_at" set data type timestamp without time zone using "paid_at"::timestamp without time zone;

alter table "public"."worker_reimbursements" alter column "worker_id" drop not null;

alter table "public"."workers" drop column "daily_rate";

alter table "public"."workers" drop column "default_ot_rate";

alter table "public"."workers" drop column "trade";

alter table "public"."workers" drop column "updated_at";

alter table "public"."workers" alter column "created_at" drop not null;

alter table "public"."workers" alter column "status" drop not null;

CREATE UNIQUE INDEX accounting_periods_month_key ON public.accounting_periods USING btree (month);

CREATE UNIQUE INDEX accounting_periods_pkey ON public.accounting_periods USING btree (id);

CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id);

CREATE UNIQUE INDEX completion_certificates_pkey ON public.completion_certificates USING btree (id);

CREATE UNIQUE INDEX cost_allocations_pkey ON public.cost_allocations USING btree (id);

CREATE UNIQUE INDEX final_punch_list_items_pkey ON public.final_punch_list_items USING btree (id);

CREATE UNIQUE INDEX final_punch_lists_pkey ON public.final_punch_lists USING btree (id);

CREATE INDEX idx_daily_work_date ON public.daily_work_entries USING btree (work_date);

CREATE INDEX idx_expenses_created ON public.expenses USING btree (created_at DESC);

CREATE INDEX idx_expenses_project ON public.expenses USING btree (project_id);

CREATE INDEX idx_inspection_log_date ON public.inspection_log USING btree (inspection_date);

CREATE INDEX idx_inspection_log_project ON public.inspection_log USING btree (project_id);

CREATE INDEX idx_invoices_project ON public.invoices USING btree (project_id);

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);

CREATE INDEX idx_labor_worker ON public.labor_entries USING btree (worker_id);

CREATE INDEX idx_project_schedule_dates ON public.project_schedule USING btree (start_date, end_date);

CREATE INDEX idx_project_schedule_project ON public.project_schedule USING btree (project_id);

CREATE INDEX idx_project_tasks_due ON public.project_tasks USING btree (due_date);

CREATE INDEX idx_project_tasks_project ON public.project_tasks USING btree (project_id);

CREATE INDEX idx_projects_created ON public.projects USING btree (created_at DESC);

CREATE INDEX idx_punch_list_project ON public.punch_list USING btree (project_id);

CREATE INDEX idx_worker_receipts_date ON public.worker_receipts USING btree (receipt_date);

CREATE INDEX idx_worker_receipts_reimbursement_id ON public.worker_receipts USING btree (reimbursement_id);

CREATE UNIQUE INDEX inspection_logs_pkey ON public.inspection_logs USING btree (id);

CREATE UNIQUE INDEX material_selections_pkey ON public.material_selections USING btree (id);

CREATE UNIQUE INDEX project_cost_codes_pkey ON public.project_cost_codes USING btree (id);

CREATE UNIQUE INDEX warranties_pkey ON public.warranties USING btree (id);

alter table "public"."accounting_periods" add constraint "accounting_periods_pkey" PRIMARY KEY using index "accounting_periods_pkey";

alter table "public"."clients" add constraint "clients_pkey" PRIMARY KEY using index "clients_pkey";

alter table "public"."completion_certificates" add constraint "completion_certificates_pkey" PRIMARY KEY using index "completion_certificates_pkey";

alter table "public"."cost_allocations" add constraint "cost_allocations_pkey" PRIMARY KEY using index "cost_allocations_pkey";

alter table "public"."final_punch_list_items" add constraint "final_punch_list_items_pkey" PRIMARY KEY using index "final_punch_list_items_pkey";

alter table "public"."final_punch_lists" add constraint "final_punch_lists_pkey" PRIMARY KEY using index "final_punch_lists_pkey";

alter table "public"."inspection_logs" add constraint "inspection_logs_pkey" PRIMARY KEY using index "inspection_logs_pkey";

alter table "public"."material_selections" add constraint "material_selections_pkey" PRIMARY KEY using index "material_selections_pkey";

alter table "public"."project_cost_codes" add constraint "project_cost_codes_pkey" PRIMARY KEY using index "project_cost_codes_pkey";

alter table "public"."warranties" add constraint "warranties_pkey" PRIMARY KEY using index "warranties_pkey";

alter table "public"."accounting_periods" add constraint "accounting_periods_month_key" UNIQUE using index "accounting_periods_month_key";

alter table "public"."accounts" add constraint "accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."accounts" validate constraint "accounts_user_id_fkey";

alter table "public"."completion_certificates" add constraint "completion_certificates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."completion_certificates" validate constraint "completion_certificates_project_id_fkey";

alter table "public"."cost_allocations" add constraint "cost_allocations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."cost_allocations" validate constraint "cost_allocations_project_id_fkey";

alter table "public"."final_punch_list_items" add constraint "final_punch_list_items_punch_list_id_fkey" FOREIGN KEY (punch_list_id) REFERENCES public.final_punch_lists(id) ON DELETE CASCADE not valid;

alter table "public"."final_punch_list_items" validate constraint "final_punch_list_items_punch_list_id_fkey";

alter table "public"."final_punch_lists" add constraint "final_punch_lists_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."final_punch_lists" validate constraint "final_punch_lists_project_id_fkey";

alter table "public"."inspection_logs" add constraint "inspection_logs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."inspection_logs" validate constraint "inspection_logs_project_id_fkey";

alter table "public"."labor_entries" add constraint "labor_entries_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."labor_entries" validate constraint "labor_entries_project_id_fkey";

alter table "public"."labor_invoices" add constraint "labor_invoices_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE not valid;

alter table "public"."labor_invoices" validate constraint "labor_invoices_worker_id_fkey";

alter table "public"."material_selections" add constraint "material_selections_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."material_selections" validate constraint "material_selections_project_id_fkey";

alter table "public"."project_change_orders" add constraint "project_change_orders_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."project_change_orders" validate constraint "project_change_orders_approved_by_fkey";

alter table "public"."project_cost_codes" add constraint "project_cost_codes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."project_cost_codes" validate constraint "project_cost_codes_project_id_fkey";

alter table "public"."project_material_selections" add constraint "project_material_selections_catalog_id_fkey" FOREIGN KEY (catalog_id) REFERENCES public.material_catalog(id) not valid;

alter table "public"."project_material_selections" validate constraint "project_material_selections_catalog_id_fkey";

alter table "public"."projects" add constraint "projects_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) not valid;

alter table "public"."projects" validate constraint "projects_client_id_fkey";

alter table "public"."punch_list" add constraint "punch_list_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."punch_list" validate constraint "punch_list_created_by_fkey";

alter table "public"."warranties" add constraint "warranties_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE not valid;

alter table "public"."warranties" validate constraint "warranties_project_id_fkey";

alter table "public"."worker_payments" add constraint "worker_payments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL not valid;

alter table "public"."worker_payments" validate constraint "worker_payments_project_id_fkey";

alter table "public"."bills" add constraint "bills_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."bills" validate constraint "bills_project_id_fkey";

alter table "public"."bills" add constraint "bills_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) not valid;

alter table "public"."bills" validate constraint "bills_vendor_id_fkey";

alter table "public"."commitments" add constraint "commitments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."commitments" validate constraint "commitments_project_id_fkey";

alter table "public"."daily_work_entries" add constraint "daily_work_entries_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."daily_work_entries" validate constraint "daily_work_entries_worker_id_fkey";

alter table "public"."deposits" add constraint "deposits_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL not valid;

alter table "public"."deposits" validate constraint "deposits_invoice_id_fkey";

alter table "public"."documents" add constraint "documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."documents" validate constraint "documents_project_id_fkey";

alter table "public"."expenses" add constraint "expenses_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."expenses" validate constraint "expenses_project_id_fkey";

alter table "public"."invoices" add constraint "invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) not valid;

alter table "public"."invoices" validate constraint "invoices_customer_id_fkey";

alter table "public"."invoices" add constraint "invoices_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."invoices" validate constraint "invoices_project_id_fkey";

alter table "public"."labor_entries" add constraint "labor_entries_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.labor_workers(id) not valid;

alter table "public"."labor_entries" validate constraint "labor_entries_worker_id_fkey";

alter table "public"."labor_payments" add constraint "labor_payments_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.labor_workers(id) ON DELETE CASCADE not valid;

alter table "public"."labor_payments" validate constraint "labor_payments_worker_id_fkey";

alter table "public"."project_commissions" add constraint "project_commissions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) not valid;

alter table "public"."project_commissions" validate constraint "project_commissions_project_id_fkey";

alter table "public"."project_tasks" add constraint "project_tasks_assigned_worker_id_fkey" FOREIGN KEY (assigned_worker_id) REFERENCES public.workers(id) not valid;

alter table "public"."project_tasks" validate constraint "project_tasks_assigned_worker_id_fkey";

alter table "public"."punch_list" add constraint "punch_list_assigned_worker_id_fkey" FOREIGN KEY (assigned_worker_id) REFERENCES public.workers(id) not valid;

alter table "public"."punch_list" validate constraint "punch_list_assigned_worker_id_fkey";

alter table "public"."worker_invoices" add constraint "worker_invoices_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."worker_invoices" validate constraint "worker_invoices_worker_id_fkey";

alter table "public"."worker_payments" add constraint "worker_payments_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."worker_payments" validate constraint "worker_payments_worker_id_fkey";

alter table "public"."worker_receipts" add constraint "worker_receipts_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."worker_receipts" validate constraint "worker_receipts_worker_id_fkey";

alter table "public"."worker_reimbursements" add constraint "worker_reimbursements_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL not valid;

alter table "public"."worker_reimbursements" validate constraint "worker_reimbursements_worker_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calc_invoice_item_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.amount := COALESCE(NEW.quantity, 1) * COALESCE(NEW.unit_price, 0);
  -- sync qty/quantity
  IF NEW.qty IS NOT NULL THEN
    NEW.quantity := NEW.qty;
  ELSIF NEW.quantity IS NOT NULL THEN
    NEW.qty := NEW.quantity;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_deposit_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.deposits (
    payment_id, invoice_id, project_id, customer_name, 
    deposit_account, amount, payment_method, deposit_date,
    account, date, description
  )
  VALUES (
    NEW.id,
    NEW.invoice_id,
    NEW.project_id,
    NEW.customer_name,
    NEW.deposit_account,
    NEW.amount,
    NEW.payment_method,
    NEW.payment_date,
    NEW.deposit_account,
    NEW.payment_date,
    'Payment received - ' || COALESCE(NEW.customer_name, '')
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_period_locked(p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
    v_locked boolean;
begin
    select is_locked
    into v_locked
    from accounting_periods
    where month = date_trunc('month', p_date)::date;

    if v_locked is null then
        return false;
    end if;

    return v_locked;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reallocate_labor_cost(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
    v_entry record;
begin
    select *
    into v_entry
    from labor_entries
    where id = p_entry_id
    for update;

    if not found then
        raise exception 'Labor entry not found';
    end if;

    -- 🔒 检查月份锁定
    if is_period_locked(v_entry.work_date) then
        raise exception 'This accounting period is locked.';
    end if;

    -- 先扣回旧金额
    perform reverse_labor_cost(p_entry_id);

    -- 再重新分配
    perform allocate_labor_cost(p_entry_id);

end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_accounts_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_invoice_items_qty()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.qty IS NOT NULL AND NEW.quantity = 1 THEN
    NEW.quantity := NEW.qty;
  ELSIF NEW.quantity IS NOT NULL AND NEW.qty IS NULL THEN
    NEW.qty := NEW.quantity;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_labor_cost(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
    v_entry record;
begin
    select *
    into v_entry
    from labor_entries
    where id = p_entry_id
    for update;

    if not found then
        raise exception 'Labor entry not found';
    end if;

    -- 🔒 检查月份是否锁定
    if is_period_locked(v_entry.work_date) then
        raise exception 'This accounting period is locked.';
    end if;

    -- AM only
    if v_entry.project_am_id is not null
       and v_entry.project_pm_id is null then

        update projects
        set spent = coalesce(spent,0) + v_entry.total
        where id = v_entry.project_am_id;

    -- AM + PM different
    elsif v_entry.project_am_id is not null
       and v_entry.project_pm_id is not null
       and v_entry.project_am_id <> v_entry.project_pm_id then

        update projects
        set spent = coalesce(spent,0) + (v_entry.day_rate * 0.5) + v_entry.ot_amount
        where id = v_entry.project_am_id;

        update projects
        set spent = coalesce(spent,0) + (v_entry.day_rate * 0.5)
        where id = v_entry.project_pm_id;

    end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_subcontract_bill(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_row record; begin select id, project_id, amount, status into v_row from public.subcontract_bills where id = p_bill_id for update; if not found then raise exception 'Bill not found'; end if; if v_row.status = 'Approved' then raise exception 'Bill is already approved'; end if; update public.subcontract_bills set status = 'Approved' where id = p_bill_id; update public.projects set spent = coalesce(spent, 0) + v_row.amount, updated_at = current_date where id = v_row.project_id; end; $function$
;

CREATE OR REPLACE FUNCTION public.create_subcontract_bill_guard(p_subcontract_id uuid, p_project_id uuid, p_bill_date date, p_amount numeric, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_contract_amount numeric; v_existing_total numeric; begin select contract_amount into v_contract_amount from public.subcontracts where id = p_subcontract_id; select coalesce(sum(amount), 0) into v_existing_total from public.subcontract_bills where subcontract_id = p_subcontract_id; if v_existing_total + p_amount > v_contract_amount then raise exception 'Bill exceeds subcontract contract amount'; end if; insert into public.subcontract_bills ( subcontract_id, project_id, bill_date, amount, description, status ) values ( p_subcontract_id, p_project_id, p_bill_date, p_amount, p_description, 'Pending' ); end; $function$
;

CREATE OR REPLACE FUNCTION public.record_subcontract_payment(p_subcontract_id uuid, p_bill_id uuid, p_payment_date date, p_amount numeric, p_method text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_bill_amount numeric; v_total_payments numeric; begin insert into public.subcontract_payments ( subcontract_id, bill_id, payment_date, amount, method, note ) values ( p_subcontract_id, p_bill_id, p_payment_date, p_amount, p_method, p_note ); if p_bill_id is not null then select amount into v_bill_amount from public.subcontract_bills where id = p_bill_id; if v_bill_amount is not null then select coalesce(sum(amount), 0) into v_total_payments from public.subcontract_payments where bill_id = p_bill_id; if v_total_payments >= v_bill_amount then update public.subcontract_bills set status = 'Paid' where id = p_bill_id; end if; end if; end if; end; $function$
;

CREATE OR REPLACE FUNCTION public.reverse_labor_cost(p_entry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
    v_entry record;
begin
    select *
    into v_entry
    from labor_entries
    where id = p_entry_id
    for update;

    if not found then
        raise exception 'Labor entry not found';
    end if;

    -- 🔒 检查月份是否锁定
    if is_period_locked(v_entry.work_date) then
        raise exception 'This accounting period is locked.';
    end if;

    -- AM only
    if v_entry.project_am_id is not null
       and v_entry.project_pm_id is null then

        update projects
        set spent = coalesce(spent,0) - v_entry.total
        where id = v_entry.project_am_id;

    -- AM + PM different
    elsif v_entry.project_am_id is not null
       and v_entry.project_pm_id is not null
       and v_entry.project_am_id <> v_entry.project_pm_id then

        update projects
        set spent = coalesce(spent,0) - ((v_entry.day_rate * 0.5) + v_entry.ot_amount)
        where id = v_entry.project_am_id;

        update projects
        set spent = coalesce(spent,0) - (v_entry.day_rate * 0.5)
        where id = v_entry.project_pm_id;

    end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end; $function$
;

grant delete on table "public"."accounting_periods" to "anon";

grant insert on table "public"."accounting_periods" to "anon";

grant references on table "public"."accounting_periods" to "anon";

grant select on table "public"."accounting_periods" to "anon";

grant trigger on table "public"."accounting_periods" to "anon";

grant truncate on table "public"."accounting_periods" to "anon";

grant update on table "public"."accounting_periods" to "anon";

grant delete on table "public"."accounting_periods" to "authenticated";

grant insert on table "public"."accounting_periods" to "authenticated";

grant references on table "public"."accounting_periods" to "authenticated";

grant select on table "public"."accounting_periods" to "authenticated";

grant trigger on table "public"."accounting_periods" to "authenticated";

grant truncate on table "public"."accounting_periods" to "authenticated";

grant update on table "public"."accounting_periods" to "authenticated";

grant delete on table "public"."accounting_periods" to "service_role";

grant insert on table "public"."accounting_periods" to "service_role";

grant references on table "public"."accounting_periods" to "service_role";

grant select on table "public"."accounting_periods" to "service_role";

grant trigger on table "public"."accounting_periods" to "service_role";

grant truncate on table "public"."accounting_periods" to "service_role";

grant update on table "public"."accounting_periods" to "service_role";

grant delete on table "public"."clients" to "anon";

grant insert on table "public"."clients" to "anon";

grant references on table "public"."clients" to "anon";

grant select on table "public"."clients" to "anon";

grant trigger on table "public"."clients" to "anon";

grant truncate on table "public"."clients" to "anon";

grant update on table "public"."clients" to "anon";

grant delete on table "public"."clients" to "authenticated";

grant insert on table "public"."clients" to "authenticated";

grant references on table "public"."clients" to "authenticated";

grant select on table "public"."clients" to "authenticated";

grant trigger on table "public"."clients" to "authenticated";

grant truncate on table "public"."clients" to "authenticated";

grant update on table "public"."clients" to "authenticated";

grant delete on table "public"."clients" to "service_role";

grant insert on table "public"."clients" to "service_role";

grant references on table "public"."clients" to "service_role";

grant select on table "public"."clients" to "service_role";

grant trigger on table "public"."clients" to "service_role";

grant truncate on table "public"."clients" to "service_role";

grant update on table "public"."clients" to "service_role";

grant delete on table "public"."completion_certificates" to "anon";

grant insert on table "public"."completion_certificates" to "anon";

grant references on table "public"."completion_certificates" to "anon";

grant select on table "public"."completion_certificates" to "anon";

grant trigger on table "public"."completion_certificates" to "anon";

grant truncate on table "public"."completion_certificates" to "anon";

grant update on table "public"."completion_certificates" to "anon";

grant delete on table "public"."completion_certificates" to "authenticated";

grant insert on table "public"."completion_certificates" to "authenticated";

grant references on table "public"."completion_certificates" to "authenticated";

grant select on table "public"."completion_certificates" to "authenticated";

grant trigger on table "public"."completion_certificates" to "authenticated";

grant truncate on table "public"."completion_certificates" to "authenticated";

grant update on table "public"."completion_certificates" to "authenticated";

grant delete on table "public"."completion_certificates" to "service_role";

grant insert on table "public"."completion_certificates" to "service_role";

grant references on table "public"."completion_certificates" to "service_role";

grant select on table "public"."completion_certificates" to "service_role";

grant trigger on table "public"."completion_certificates" to "service_role";

grant truncate on table "public"."completion_certificates" to "service_role";

grant update on table "public"."completion_certificates" to "service_role";

grant delete on table "public"."cost_allocations" to "anon";

grant insert on table "public"."cost_allocations" to "anon";

grant references on table "public"."cost_allocations" to "anon";

grant select on table "public"."cost_allocations" to "anon";

grant trigger on table "public"."cost_allocations" to "anon";

grant truncate on table "public"."cost_allocations" to "anon";

grant update on table "public"."cost_allocations" to "anon";

grant delete on table "public"."cost_allocations" to "authenticated";

grant insert on table "public"."cost_allocations" to "authenticated";

grant references on table "public"."cost_allocations" to "authenticated";

grant select on table "public"."cost_allocations" to "authenticated";

grant trigger on table "public"."cost_allocations" to "authenticated";

grant truncate on table "public"."cost_allocations" to "authenticated";

grant update on table "public"."cost_allocations" to "authenticated";

grant delete on table "public"."cost_allocations" to "service_role";

grant insert on table "public"."cost_allocations" to "service_role";

grant references on table "public"."cost_allocations" to "service_role";

grant select on table "public"."cost_allocations" to "service_role";

grant trigger on table "public"."cost_allocations" to "service_role";

grant truncate on table "public"."cost_allocations" to "service_role";

grant update on table "public"."cost_allocations" to "service_role";

grant delete on table "public"."final_punch_list_items" to "anon";

grant insert on table "public"."final_punch_list_items" to "anon";

grant references on table "public"."final_punch_list_items" to "anon";

grant select on table "public"."final_punch_list_items" to "anon";

grant trigger on table "public"."final_punch_list_items" to "anon";

grant truncate on table "public"."final_punch_list_items" to "anon";

grant update on table "public"."final_punch_list_items" to "anon";

grant delete on table "public"."final_punch_list_items" to "authenticated";

grant insert on table "public"."final_punch_list_items" to "authenticated";

grant references on table "public"."final_punch_list_items" to "authenticated";

grant select on table "public"."final_punch_list_items" to "authenticated";

grant trigger on table "public"."final_punch_list_items" to "authenticated";

grant truncate on table "public"."final_punch_list_items" to "authenticated";

grant update on table "public"."final_punch_list_items" to "authenticated";

grant delete on table "public"."final_punch_list_items" to "service_role";

grant insert on table "public"."final_punch_list_items" to "service_role";

grant references on table "public"."final_punch_list_items" to "service_role";

grant select on table "public"."final_punch_list_items" to "service_role";

grant trigger on table "public"."final_punch_list_items" to "service_role";

grant truncate on table "public"."final_punch_list_items" to "service_role";

grant update on table "public"."final_punch_list_items" to "service_role";

grant delete on table "public"."final_punch_lists" to "anon";

grant insert on table "public"."final_punch_lists" to "anon";

grant references on table "public"."final_punch_lists" to "anon";

grant select on table "public"."final_punch_lists" to "anon";

grant trigger on table "public"."final_punch_lists" to "anon";

grant truncate on table "public"."final_punch_lists" to "anon";

grant update on table "public"."final_punch_lists" to "anon";

grant delete on table "public"."final_punch_lists" to "authenticated";

grant insert on table "public"."final_punch_lists" to "authenticated";

grant references on table "public"."final_punch_lists" to "authenticated";

grant select on table "public"."final_punch_lists" to "authenticated";

grant trigger on table "public"."final_punch_lists" to "authenticated";

grant truncate on table "public"."final_punch_lists" to "authenticated";

grant update on table "public"."final_punch_lists" to "authenticated";

grant delete on table "public"."final_punch_lists" to "service_role";

grant insert on table "public"."final_punch_lists" to "service_role";

grant references on table "public"."final_punch_lists" to "service_role";

grant select on table "public"."final_punch_lists" to "service_role";

grant trigger on table "public"."final_punch_lists" to "service_role";

grant truncate on table "public"."final_punch_lists" to "service_role";

grant update on table "public"."final_punch_lists" to "service_role";

grant delete on table "public"."inspection_logs" to "anon";

grant insert on table "public"."inspection_logs" to "anon";

grant references on table "public"."inspection_logs" to "anon";

grant select on table "public"."inspection_logs" to "anon";

grant trigger on table "public"."inspection_logs" to "anon";

grant truncate on table "public"."inspection_logs" to "anon";

grant update on table "public"."inspection_logs" to "anon";

grant delete on table "public"."inspection_logs" to "authenticated";

grant insert on table "public"."inspection_logs" to "authenticated";

grant references on table "public"."inspection_logs" to "authenticated";

grant select on table "public"."inspection_logs" to "authenticated";

grant trigger on table "public"."inspection_logs" to "authenticated";

grant truncate on table "public"."inspection_logs" to "authenticated";

grant update on table "public"."inspection_logs" to "authenticated";

grant delete on table "public"."inspection_logs" to "service_role";

grant insert on table "public"."inspection_logs" to "service_role";

grant references on table "public"."inspection_logs" to "service_role";

grant select on table "public"."inspection_logs" to "service_role";

grant trigger on table "public"."inspection_logs" to "service_role";

grant truncate on table "public"."inspection_logs" to "service_role";

grant update on table "public"."inspection_logs" to "service_role";

grant delete on table "public"."material_selections" to "anon";

grant insert on table "public"."material_selections" to "anon";

grant references on table "public"."material_selections" to "anon";

grant select on table "public"."material_selections" to "anon";

grant trigger on table "public"."material_selections" to "anon";

grant truncate on table "public"."material_selections" to "anon";

grant update on table "public"."material_selections" to "anon";

grant delete on table "public"."material_selections" to "authenticated";

grant insert on table "public"."material_selections" to "authenticated";

grant references on table "public"."material_selections" to "authenticated";

grant select on table "public"."material_selections" to "authenticated";

grant trigger on table "public"."material_selections" to "authenticated";

grant truncate on table "public"."material_selections" to "authenticated";

grant update on table "public"."material_selections" to "authenticated";

grant delete on table "public"."material_selections" to "service_role";

grant insert on table "public"."material_selections" to "service_role";

grant references on table "public"."material_selections" to "service_role";

grant select on table "public"."material_selections" to "service_role";

grant trigger on table "public"."material_selections" to "service_role";

grant truncate on table "public"."material_selections" to "service_role";

grant update on table "public"."material_selections" to "service_role";

grant delete on table "public"."project_cost_codes" to "anon";

grant insert on table "public"."project_cost_codes" to "anon";

grant references on table "public"."project_cost_codes" to "anon";

grant select on table "public"."project_cost_codes" to "anon";

grant trigger on table "public"."project_cost_codes" to "anon";

grant truncate on table "public"."project_cost_codes" to "anon";

grant update on table "public"."project_cost_codes" to "anon";

grant delete on table "public"."project_cost_codes" to "authenticated";

grant insert on table "public"."project_cost_codes" to "authenticated";

grant references on table "public"."project_cost_codes" to "authenticated";

grant select on table "public"."project_cost_codes" to "authenticated";

grant trigger on table "public"."project_cost_codes" to "authenticated";

grant truncate on table "public"."project_cost_codes" to "authenticated";

grant update on table "public"."project_cost_codes" to "authenticated";

grant delete on table "public"."project_cost_codes" to "service_role";

grant insert on table "public"."project_cost_codes" to "service_role";

grant references on table "public"."project_cost_codes" to "service_role";

grant select on table "public"."project_cost_codes" to "service_role";

grant trigger on table "public"."project_cost_codes" to "service_role";

grant truncate on table "public"."project_cost_codes" to "service_role";

grant update on table "public"."project_cost_codes" to "service_role";

grant delete on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant insert on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant references on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant select on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant trigger on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant truncate on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant update on table "public"."tmp_backup_worker_advances_haijun" to "anon";

grant delete on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant insert on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant references on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant select on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant trigger on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant truncate on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant update on table "public"."tmp_backup_worker_advances_haijun" to "authenticated";

grant delete on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant insert on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant references on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant select on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant trigger on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant truncate on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant update on table "public"."tmp_backup_worker_advances_haijun" to "service_role";

grant delete on table "public"."warranties" to "anon";

grant insert on table "public"."warranties" to "anon";

grant references on table "public"."warranties" to "anon";

grant select on table "public"."warranties" to "anon";

grant trigger on table "public"."warranties" to "anon";

grant truncate on table "public"."warranties" to "anon";

grant update on table "public"."warranties" to "anon";

grant delete on table "public"."warranties" to "authenticated";

grant insert on table "public"."warranties" to "authenticated";

grant references on table "public"."warranties" to "authenticated";

grant select on table "public"."warranties" to "authenticated";

grant trigger on table "public"."warranties" to "authenticated";

grant truncate on table "public"."warranties" to "authenticated";

grant update on table "public"."warranties" to "authenticated";

grant delete on table "public"."warranties" to "service_role";

grant insert on table "public"."warranties" to "service_role";

grant references on table "public"."warranties" to "service_role";

grant select on table "public"."warranties" to "service_role";

grant trigger on table "public"."warranties" to "service_role";

grant truncate on table "public"."warranties" to "service_role";

grant update on table "public"."warranties" to "service_role";


  create policy "allow authenticated delete"
  on "public"."accounting_periods"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."accounting_periods"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."accounting_periods"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."accounting_periods"
  as permissive
  for update
  to authenticated
using (true);



  create policy "accounts_all_anon"
  on "public"."accounts"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "accounts_all_authenticated"
  on "public"."accounts"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."accounts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."accounts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."accounts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."accounts"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."activity_logs"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."activity_logs"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."activity_logs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."activity_logs"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."bills"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."bills"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."bills"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."bills"
  as permissive
  for update
  to authenticated
using (true);



  create policy "bills_delete_all"
  on "public"."bills"
  as permissive
  for delete
  to anon
using (true);



  create policy "bills_insert_all"
  on "public"."bills"
  as permissive
  for insert
  to anon
with check (true);



  create policy "bills_select_all"
  on "public"."bills"
  as permissive
  for select
  to anon
using (true);



  create policy "bills_update_all"
  on "public"."bills"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."clients"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."clients"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."clients"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."clients"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."commission_payment_records"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."commission_payment_records"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."commission_payment_records"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."commission_payment_records"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."commitments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."commitments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."commitments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."commitments"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."commitments"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."company_profile"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."company_profile"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."company_profile"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."company_profile"
  as permissive
  for update
  to authenticated
using (true);



  create policy "company_profile_delete_all"
  on "public"."company_profile"
  as permissive
  for delete
  to anon
using (true);



  create policy "company_profile_insert_all"
  on "public"."company_profile"
  as permissive
  for insert
  to anon
with check (true);



  create policy "company_profile_select_all"
  on "public"."company_profile"
  as permissive
  for select
  to anon
using (true);



  create policy "company_profile_update_all"
  on "public"."company_profile"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."completion_certificates"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."completion_certificates"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."completion_certificates"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."completion_certificates"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."cost_allocations"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."cost_allocations"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."cost_allocations"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."cost_allocations"
  as permissive
  for update
  to authenticated
using (true);



  create policy "cost_allocations_delete_all"
  on "public"."cost_allocations"
  as permissive
  for delete
  to anon
using (true);



  create policy "cost_allocations_insert_all"
  on "public"."cost_allocations"
  as permissive
  for insert
  to anon
with check (true);



  create policy "cost_allocations_select_all"
  on "public"."cost_allocations"
  as permissive
  for select
  to anon
using (true);



  create policy "cost_allocations_update_all"
  on "public"."cost_allocations"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."customers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."customers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."customers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."customers"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."daily_work_entries"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."daily_work_entries"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."daily_work_entries"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."daily_work_entries"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."deposits"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."deposits"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."deposits"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."deposits"
  as permissive
  for update
  to authenticated
using (true);



  create policy "deposits_authenticated"
  on "public"."deposits"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."documents"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."documents"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."documents"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."documents"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."estimate_categories"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."estimate_categories"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."estimate_categories"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."estimate_categories"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."estimate_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."estimate_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."estimate_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."estimate_items"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."estimate_meta"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."estimate_meta"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."estimate_meta"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."estimate_meta"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."estimate_snapshots"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."estimate_snapshots"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."estimate_snapshots"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."estimate_snapshots"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."estimates"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."estimates"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."estimates"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."estimates"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."expense_lines"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."expense_lines"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."expense_lines"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."expense_lines"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."expense_lines"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."expenses"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."expenses"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."expenses"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."expenses"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."expenses"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."final_punch_list_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."final_punch_list_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."final_punch_list_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."final_punch_list_items"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."final_punch_lists"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."final_punch_lists"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."final_punch_lists"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."final_punch_lists"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."inspection_log"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."inspection_log"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."inspection_log"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."inspection_log"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."inspection_logs"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."inspection_logs"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."inspection_logs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."inspection_logs"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."invoice_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."invoice_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."invoice_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."invoice_items"
  as permissive
  for update
  to authenticated
using (true);



  create policy "invoice_items_anon"
  on "public"."invoice_items"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "invoice_items_authenticated"
  on "public"."invoice_items"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."invoice_payments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."invoice_payments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."invoice_payments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."invoice_payments"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."invoice_payments"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."invoices"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."invoices"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."invoices"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."invoices"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."invoices"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."labor_entries"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."labor_entries"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."labor_entries"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."labor_entries"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."labor_entries"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."labor_invoices"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."labor_invoices"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."labor_invoices"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."labor_invoices"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."labor_payments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."labor_payments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."labor_payments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."labor_payments"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."labor_workers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."labor_workers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."labor_workers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."labor_workers"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."labor_workers"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."material_catalog"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."material_catalog"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."material_catalog"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."material_catalog"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."material_selections"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."material_selections"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."material_selections"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."material_selections"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."payments_received"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."payments_received"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."payments_received"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."payments_received"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_budget_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_budget_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_budget_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_budget_items"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_change_order_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_change_order_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_change_order_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_change_order_items"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_change_orders"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_change_orders"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_change_orders"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_change_orders"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_commissions"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_commissions"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_commissions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_commissions"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_cost_codes"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_cost_codes"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_cost_codes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_cost_codes"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_material_selections"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_material_selections"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_material_selections"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_material_selections"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_schedule"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_schedule"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_schedule"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_schedule"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."project_tasks"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."project_tasks"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."project_tasks"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."project_tasks"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."projects"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."projects"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."projects"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."projects"
  as permissive
  for update
  to authenticated
using (true);



  create policy "dev full access"
  on "public"."projects"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."punch_list"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."punch_list"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."punch_list"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."punch_list"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."site_photos"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."site_photos"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."site_photos"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."site_photos"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."subcontract_bills"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."subcontract_bills"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."subcontract_bills"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."subcontract_bills"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."subcontract_payments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."subcontract_payments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."subcontract_payments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."subcontract_payments"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."subcontractors"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."subcontractors"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."subcontractors"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."subcontractors"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."subcontracts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."subcontracts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."subcontracts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."subcontracts"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."vendors"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."vendors"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."vendors"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."vendors"
  as permissive
  for update
  to authenticated
using (true);



  create policy "vendors_delete_all"
  on "public"."vendors"
  as permissive
  for delete
  to anon
using (true);



  create policy "vendors_insert_all"
  on "public"."vendors"
  as permissive
  for insert
  to anon
with check (true);



  create policy "vendors_select_all"
  on "public"."vendors"
  as permissive
  for select
  to anon
using (true);



  create policy "vendors_update_all"
  on "public"."vendors"
  as permissive
  for update
  to anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."warranties"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."warranties"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."warranties"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."warranties"
  as permissive
  for update
  to authenticated
using (true);



  create policy "advances_authenticated"
  on "public"."worker_advances"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."worker_advances"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."worker_advances"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."worker_advances"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."worker_advances"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."worker_invoices"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."worker_invoices"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."worker_invoices"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."worker_invoices"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."worker_payments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."worker_payments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."worker_payments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."worker_payments"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."worker_receipts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."worker_receipts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."worker_receipts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."worker_receipts"
  as permissive
  for update
  to authenticated
using (true);



  create policy "worker_receipts_delete_all_open"
  on "public"."worker_receipts"
  as permissive
  for delete
  to authenticated, anon
using (true);



  create policy "worker_receipts_insert_all_open"
  on "public"."worker_receipts"
  as permissive
  for insert
  to public
with check (true);



  create policy "worker_receipts_select_all_open"
  on "public"."worker_receipts"
  as permissive
  for select
  to public
using (true);



  create policy "worker_receipts_update_all_open"
  on "public"."worker_receipts"
  as permissive
  for update
  to authenticated, anon
using (true)
with check (true);



  create policy "allow authenticated delete"
  on "public"."worker_reimbursements"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."worker_reimbursements"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."worker_reimbursements"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."worker_reimbursements"
  as permissive
  for update
  to authenticated
using (true);



  create policy "allow authenticated delete"
  on "public"."workers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "allow authenticated insert"
  on "public"."workers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow authenticated read"
  on "public"."workers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow authenticated update"
  on "public"."workers"
  as permissive
  for update
  to authenticated
using (true);


CREATE TRIGGER accounts_set_user_id BEFORE INSERT ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_accounts_user_id();

CREATE TRIGGER calc_amount_trigger BEFORE INSERT OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_item_amount();

CREATE TRIGGER auto_create_deposit AFTER INSERT ON public.payments_received FOR EACH ROW EXECUTE FUNCTION public.create_deposit_on_payment();

drop trigger if exists "on_auth_user_created" on "auth"."users";

drop policy "attachments_bucket_delete_auth" on "storage"."objects";

drop policy "attachments_bucket_insert_auth" on "storage"."objects";

drop policy "attachments_bucket_select_auth" on "storage"."objects";

drop policy "attachments_bucket_update_auth" on "storage"."objects";

drop policy "punch_photos_delete" on "storage"."objects";

drop policy "punch_photos_insert" on "storage"."objects";

drop policy "punch_photos_read" on "storage"."objects";

drop policy "worker_receipts_anon_insert" on "storage"."objects";

drop policy "worker_receipts_public_read" on "storage"."objects";


  create policy "worker_receipts_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated, anon
with check ((bucket_id = 'worker-receipts'::text));



  create policy "worker_receipts_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated, anon
using ((bucket_id = 'worker-receipts'::text));



