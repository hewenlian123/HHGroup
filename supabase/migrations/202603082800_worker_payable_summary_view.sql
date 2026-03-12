-- View: worker_payable_summary (total earned from labor_entries, total paid from labor_payments, balance).

create or replace view public.worker_payable_summary as
select
    w.id as worker_id,
    w.name as worker_name,

    coalesce(sum(le.total), 0) as total_earned,

    coalesce((
        select sum(lp.amount)
        from labor_payments lp
        where lp.worker_id = w.id
    ), 0) as total_paid,

    coalesce(sum(le.total), 0)
    -
    coalesce((
        select sum(lp.amount)
        from labor_payments lp
        where lp.worker_id = w.id
    ), 0) as balance

from public.labor_workers w
left join public.labor_entries le on le.worker_id = w.id
group by w.id, w.name;
