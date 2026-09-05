"use client";

import dynamic from "next/dynamic";

// Resolve the form's async SSR module inside the client boundary, before
// reading its default export. SSR remains enabled for the invoice form.
const NewInvoiceClient = dynamic(() => import("./new-invoice-client"), { ssr: true });

export default NewInvoiceClient;
