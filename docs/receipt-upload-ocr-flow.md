# Receipt upload, compression, and OCR

This document describes how **receipt images** move through the app today: client compression, storage naming, the single OCR API, and how **Quick Expense** and **Receipt Queue** share the same pipeline. Use it to avoid E2E or feature work that assumes the wrong filename or duplicate OCR systems.

For **Expenses page perf / local schema / batching** (not OCR-specific), see [performance-notes.md](./performance-notes.md).

## Single OCR API

- **`POST /api/ocr-receipt`** (`src/app/api/ocr-receipt/route.ts`) is the **only** server endpoint used for receipt OCR.
- Client code calls it via **`runReceiptOcrForImageFile`** and related helpers in **`src/lib/receipt-ocr-client.ts`** (`mergeReceiptOcrResults`, etc.).
- There is **no** separate “second” OCR pipeline for Quick Expense vs Receipt Queue.

## Shared pipeline: Quick Expense and Receipt Queue

Both flows ultimately use the same building blocks:

1. **`compressImageFileForReceiptUpload`** (`src/lib/image-compress-browser.ts`) — run **before** uploading to storage / inserting queue rows (see below).
2. **Storage upload** — e.g. `uploadReceiptToStorage` / expense attachment helpers (`src/lib/expense-receipt-upload-browser.ts` and callers).
3. **OCR** — image files are processed through **`/api/ocr-receipt`**; results are merged with **`mergeReceiptOcrResults`**.
4. **Receipt Queue background OCR** — **`scheduleReceiptQueueOcr`** in **`src/lib/receipt-queue-process-upload.ts`** runs after upload; it patches queue rows only where fields are still empty (see “Autofill rules”).

Quick Expense wiring lives under **`src/app/financial/expenses/quick-expense-modal.tsx`**.  
Receipt Queue wiring lives under **`src/app/financial/receipt-queue/`** (workspace + row card) and **`src/lib/receipt-queue-process-upload.ts`**.

### “Preparing image…” vs upload

While raster receipt files are being compressed client-side, UIs show **Preparing image…** and disable duplicate upload actions / Save (Quick Expense) or keep the queue upload control busy (Receipt Queue). After compression, normal **Uploading…** / upload progress applies.

### Mobile capture (no in-app camera preview)

Receipt capture continues to use **native file inputs** with **`capture="environment"`** where appropriate so users get the **system camera** on mobile without embedding a live preview component or managing `getUserMedia` streams.

## Dependencies we intentionally did **not** add

- **`browser-image-compression`** — Not used. The custom compressor in `image-compress-browser.ts` already covers MVP needs (resize + JPEG). Adding another library would duplicate behavior, increase bundle size, and create subtle differences in output filenames and tests without clear product payoff.
- **`react-camera-pro`** — Not used. Quick Expense and Receipt Queue rely on **`<input type="file" capture="environment">`** so the **system camera / picker** handles capture. That avoids extra permissions UX, keeps Safari/iOS behavior predictable, and matches the current minimal UI.

## Compression: `compressImageFileForReceiptUpload`

- **Purpose:** Downscale very large images (max edge **1800px**), output **JPEG** at quality **~0.78**, for faster uploads and consistent OCR input.
- **UI:** After `createImageBitmap`, the helper **yields one animation frame** (`requestAnimationFrame`) so the browser can paint status text (e.g. **“Preparing image…”**) before heavy canvas work. Compression still runs on the **main thread**; full non-blocking compression would require a Web Worker (not in scope for MVP).
- **When it runs:** For typical raster images (`file.type` starts with `image/` and is not `image/svg+xml`). **PDFs and other non-image types** are returned **unchanged** (no rename).
- **Raster output:** The compressor draws to a canvas and **`canvas.toBlob(..., "image/jpeg", ...)`**, so the resulting **`File`** is **`image/jpeg`** named **`{basename}.jpg`** (basename = original name without extension, or `receipt`).
- **Common transitions:**
  - **PNG → JPEG** → stored name often **`.jpg`** even if the user picked **`.png`**.
  - **Large dimensions** → may be scaled down; still emitted as JPEG with **`.jpg`** name.
  - **HEIC / other formats:** If the browser can decode them via **`createImageBitmap`**, they follow the same path and become **`.jpg`**. If decoding fails, the helper **falls back to the original `File`** (name and type unchanged).

## `file_name` in `receipt_queue` vs user input

- Queue rows are inserted with **`insertReceiptQueueProcessing`** using the **`File`** object passed in — after compression that is often **`something.jpg`**, not the original **`something.png`**.
- The UI shows **`row.file_name`** (see **`data-queue-file-name`** on receipt queue rows). That value is the **stored / compressed** name, not necessarily the name from **`setInputFiles({ name: ... })`** in Playwright.

**E2E rule:** Assert against the **stored** filename (e.g. **`.jpg`** after PNG→JPEG compression), not only the original fixture name. See **`receiptQueueRowByFileName`** in **`tests/e2e-expenses-helpers.ts`** (comment there).

## OCR behavior (product expectations; no duplicate systems)

- **Failure:** OCR errors must **not** block saving expenses or removing queue rows; previews should remain when the UI already has them.
- **Retry:** UI may offer **Retry OCR** (e.g. Quick Expense, Receipt Queue row actions) to re-run OCR on the image when applicable.
- **Autofill:** Merged OCR applies **only to empty fields** — **do not overwrite** values the user already typed (vendor, amount, date, category, etc., per implementation in the modal and **`scheduleReceiptQueueOcr`** patches).

## Related code pointers

| Topic                         | Location                                  |
| ----------------------------- | ----------------------------------------- |
| OCR API                       | `src/app/api/ocr-receipt/route.ts`        |
| OCR merge / parsing helpers   | `src/lib/receipt-ocr-client.ts`           |
| Compression                   | `src/lib/image-compress-browser.ts`       |
| Queue upload + OCR scheduling | `src/lib/receipt-queue-process-upload.ts` |
| Queue CRUD / fetch            | `src/lib/receipt-queue.ts`                |

---

_Last updated to reflect client JPEG compression and shared OCR pipeline. Schema unchanged here._
