# Expense Options Legacy Consumers

Expense entry, inbox review, expense detail, quick expense, and Settings -> Expenses should use
`expense_options` through the shared helpers in `src/lib/expense-options-db.ts`,
`src/lib/reference-data-db.ts`, and the expense picker components.

Intentional legacy consumers remaining after the Expense Options migration:

- `src/app/financial/bank/bank-client.tsx`: bank reconciliation keeps its own legacy payment method list while bank workflows are migrated separately.
- `src/app/labor/payments/payments-client.tsx`: labor payments are not expense dropdowns and continue to read `payment_methods`.
- `src/lib/reference-data-db.ts`: fallback path only. It reads/writes legacy `payment_methods` when `expense_options` is unavailable so old deployments and partially migrated databases keep working.
- `src/lib/expense-options-db.ts`: fallback path only. It reads legacy `payment_methods` to populate active defaults and pickers if `expense_options` is missing or empty.
