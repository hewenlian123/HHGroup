# Authenticated worker receipt intake contract

The September 6, 2026 production-completion authorization closes anonymous business access,
including the former public receipt intake. `/upload-receipt` redirects signed-out users to
login. All three intake APIs require an authenticated, active member of HH's canonical
company organization before any business read or write:

- `GET /api/upload-receipt/options` reads authorized worker and project choices.
- `POST /api/upload-receipt/upload` accepts a JPG, PNG, WebP, or PDF under 10 MB.
- `POST /api/upload-receipt/submit` validates metadata and an existing private upload path.
  Project assignment additionally verifies access to that exact company project.

Owner, admin, and assistant company members retain narrow receipt submission access.
The authenticated session client performs every intake query and Storage operation; intake
never constructs a service-role client. RLS verifies the worker/name pair, project, upload
existence, amount, date, allowed fields, and initial Pending status. Submission returns no
receipt row or readback.

The `worker-receipts` bucket is private. Upload returns only
`uploads/<UUID>.<extension>`, never a public URL. Anonymous and foreign-company callers cannot
upload, submit, list, download, update, or delete receipts. Existing historical references are
preserved. Assistant intake does not grant receipt review or mutation privileges.

Approval, rejection, deletion, payment, reconciliation, signed previews, OCR, and
`GET /api/upload-receipt/sync` continue to require verified owner/admin authorization plus
live canonical-company membership. Query or write failures are explicit errors.
