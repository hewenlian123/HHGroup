-- Store card name (or debit card name) when payment method is Credit Card or Debit Card.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS card_name text;
COMMENT ON COLUMN public.expenses.card_name IS 'Card name when payment_method is Credit Card or Debit Card (e.g. Chase Ink, Amex Gold).';
