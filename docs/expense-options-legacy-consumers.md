# Expense Options Canonical Contract

Expense entry, inbox review, expense detail, quick expense, and Settings -> Expenses should use
`expense_options` through the shared helpers in `src/lib/expense-options-db.ts`,
`src/lib/reference-data-db.ts`, and the expense picker components.

There are no intentional production consumers of the retired `payment_methods` table.

- Bank Reconciliation creates payment methods through `/api/settings/expense-options`.
- Bank and Labor payment-method lists read active `expense_options` rows with
  `type = 'payment_method'`.
- Shared reference-data and picker helpers use `expense_options`; display defaults do not probe or
  recreate the retired table.
