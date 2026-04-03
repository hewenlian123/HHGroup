-- Audit helpers for public.commissions + public.commission_payments (post-migration names).

SELECT
  c.id AS commission_id,
  c.project_id,
  c.person_name,
  c.commission_amount,
  coalesce(sum(p.amount), 0)::numeric(14, 2) AS paid_total,
  count(p.id)::int AS payment_row_count
FROM public.commissions c
LEFT JOIN public.commission_payments p ON p.commission_id = c.id
GROUP BY c.id, c.project_id, c.person_name, c.commission_amount
HAVING coalesce(sum(p.amount), 0) > 0
ORDER BY paid_total DESC;

SELECT p.*
FROM public.commission_payments p
LEFT JOIN public.commissions c ON c.id = p.commission_id
WHERE c.id IS NULL;
