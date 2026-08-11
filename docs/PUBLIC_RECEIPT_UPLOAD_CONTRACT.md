# Public worker receipt upload contract

The legacy `/upload-receipt` workflow remains intentionally public so a worker can submit a
receipt without an owner/admin session. Its public API surface is limited to:

- `GET /api/upload-receipt/options` — only active worker/project `id` and `name` choices
  permitted by anon RLS.
- `POST /api/upload-receipt/upload` — a JPG, PNG, WebP, or PDF under 10 MB to the
  `worker-receipts` upload path permitted by Storage policy.
- `POST /api/upload-receipt/submit` — validated receipt metadata referencing a previously
  uploaded path, only when anon RLS permits the insert; the inserted receipt always starts in
  `Pending` status and returns no receipt row or readback.

The `worker-receipts` bucket is private. Upload returns only the canonical private
`uploads/<UUID>.<extension>` path, never a public URL. Existing public-style references are
normalized to their object path for owner/admin review; neither the existing row nor object is
rewritten. Anonymous callers cannot list, download, update, or delete receipt objects.

These routes must use only the anon/RLS client and must not use a service-role client. Approval,
rejection, deletion, payment, storage reconciliation, and signed/proxied previews require a
verified owner/admin session. Receipt OCR is not public and requires a verified owner/admin
session. `GET /api/upload-receipt/sync` remains owner/admin-only.
