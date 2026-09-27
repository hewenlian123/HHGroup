import { beforeEach, describe, expect, it, vi } from "vitest";

type DbResult = { data: unknown; error: { message?: string } | null };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  requireRequestClient: vi.fn(),
  getProjectByIdWithClient: vi.fn(),
  getPaymentsReceivedByInvoiceId: vi.fn(),
  getPaymentAttachmentPreviewUrl: vi.fn(),
  getDepositsByInvoiceId: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdminRequestClient: mocks.requireRequestClient,
}));

vi.mock("@/lib/projects-db", () => ({
  getProjectByIdWithClient: mocks.getProjectByIdWithClient,
}));

vi.mock("@/lib/payments-received-db", () => ({
  getPaymentsReceivedByInvoiceId: mocks.getPaymentsReceivedByInvoiceId,
  getPaymentAttachmentPreviewUrl: mocks.getPaymentAttachmentPreviewUrl,
}));

vi.mock("@/lib/deposits-db", () => ({
  getDepositsByInvoiceId: mocks.getDepositsByInvoiceId,
}));

const invoiceRow = {
  id: "invoice-1",
  project_id: "project-1",
  customer_id: "customer-1",
  invoice_no: "INV-0001",
  client_name: "Customer One",
  issue_date: "2026-09-01",
  due_date: "2999-09-30",
  status: "Sent",
  total: 999,
  notes: "Keep the current DTO",
  tax_pct: 4,
  subtotal: 999,
  tax_amount: 0,
  created_at: "2026-09-01T00:00:00.000Z",
};

const itemRows = [
  {
    id: "item-1",
    invoice_id: "invoice-1",
    description: "Labor",
    quantity: 2,
    qty: null,
    unit_price: 100,
    amount: 200,
  },
  {
    id: "item-2",
    invoice_id: "invoice-1",
    description: "Material",
    quantity: null,
    qty: 1,
    unit_price: 50,
    amount: 50,
  },
];

const paymentRows = [
  {
    id: "invoice-payment-1",
    invoice_id: "invoice-1",
    amount: 60,
    payment_date: "2026-09-02",
    paid_at: "2026-09-02T12:00:00.000Z",
    method: "ACH",
    reference: "REF-1",
    memo: "Posted payment",
    status: "Posted",
    payment_received_id: "payment-received-1",
  },
  {
    id: "invoice-payment-void",
    invoice_id: "invoice-1",
    amount: 30,
    payment_date: "2026-09-02",
    paid_at: "2026-09-02T13:00:00.000Z",
    method: "Check",
    reference: null,
    memo: "Voided payment",
    status: "Voided",
    payment_received_id: null,
  },
];

const project = { id: "project-1", name: "Project One" };
const paymentsReceived = [
  {
    id: "payment-received-1",
    invoice_id: "invoice-1",
    project_id: "project-1",
    customer_name: "Customer One",
    payment_date: "2026-09-02",
    amount: 60,
    payment_method: "ACH",
    deposit_account: "Operating",
    notes: "Posted payment",
    attachment_url: null,
    status: "recorded",
    created_at: "2026-09-02T12:00:00.000Z",
    attachments: [
      {
        id: "attachment-1",
        payment_id: "payment-received-1",
        file_url: "payment-received-1/receipt.pdf",
        file_name: "receipt.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        file_type: "pdf",
        created_at: "2026-09-02T12:00:00.000Z",
      },
    ],
  },
];
const deposits = [
  {
    id: "deposit-1",
    payment_id: "payment-received-1",
    amount: 60,
    account: "Operating",
    date: "2026-09-02",
    description: "Customer One",
    project_id: "project-1",
    created_at: "2026-09-02T12:00:00.000Z",
  },
];

function createQueryClient(options: {
  invoice?: DbResult;
  items?: DbResult | Promise<DbResult>;
  payments?: DbResult | Promise<DbResult>;
}) {
  const starts: string[] = [];
  const results: Record<string, DbResult | Promise<DbResult>> = {
    invoices: options.invoice ?? { data: invoiceRow, error: null },
    invoice_items: options.items ?? { data: itemRows, error: null },
    invoice_payments: options.payments ?? { data: paymentRows, error: null },
  };

  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const begin = () => {
      starts.push(table);
      return Promise.resolve(result);
    };
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => begin());
    chain.maybeSingle = vi.fn(() => begin());
    chain.then = (resolve: (value: DbResult) => unknown, reject?: (reason: unknown) => unknown) =>
      begin().then(resolve, reject);
    return chain;
  });

  return { client: { from }, starts };
}

async function getInvoiceDetail(id = "invoice-1") {
  const { GET } = await import("@/app/api/invoices/[id]/route");
  return GET(new Request(`http://localhost/api/invoices/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("Invoice Detail initial load", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getProjectByIdWithClient.mockResolvedValue(project);
    mocks.getPaymentsReceivedByInvoiceId.mockResolvedValue(paymentsReceived);
    mocks.getPaymentAttachmentPreviewUrl.mockResolvedValue(
      "https://signed.example/payment-received-1/receipt.pdf"
    );
    mocks.getDepositsByInvoiceId.mockResolvedValue(deposits);
  });

  it("preserves the existing financial DTO and formulas while using one request client", async () => {
    const { client } = createQueryClient({});
    mocks.requireRequestClient.mockResolvedValue({ ok: true, client });

    const response = await getInvoiceDetail();

    expect(response.status).toBe(200);
    expect(response.headers.get("Server-Timing")).toMatch(
      /hh_auth;dur=\d+\.\d, hh_server_data;dur=\d+\.\d, hh_handler_total;dur=\d+\.\d/
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      invoice: {
        id: "invoice-1",
        invoiceNo: "INV-0001",
        projectId: "project-1",
        customerId: "customer-1",
        clientName: "Customer One",
        issueDate: "2026-09-01",
        dueDate: "2999-09-30",
        status: "Sent",
        lineItems: [
          { description: "Labor", qty: 2, unitPrice: 100, amount: 200 },
          { description: "Material", qty: 1, unitPrice: 50, amount: 50 },
        ],
        subtotal: 250,
        taxPct: 4,
        taxAmount: 10,
        total: 260,
        notes: "Keep the current DTO",
        paidTotal: 60,
        balanceDue: 200,
        computedStatus: "Partial",
        daysOverdue: 0,
      },
      payments: [
        {
          id: "invoice-payment-1",
          invoiceId: "invoice-1",
          date: "2026-09-02",
          amount: 60,
          method: "ACH",
          memo: "Posted payment",
          status: "Posted",
          paymentReceivedId: "payment-received-1",
        },
        {
          id: "invoice-payment-void",
          invoiceId: "invoice-1",
          date: "2026-09-02",
          amount: 30,
          method: "Check",
          memo: "Voided payment",
          status: "Voided",
          paymentReceivedId: null,
        },
      ],
      paymentsReceived: [
        {
          ...paymentsReceived[0],
          attachments: [
            {
              ...paymentsReceived[0].attachments[0],
              previewUrl: "https://signed.example/payment-received-1/receipt.pdf",
            },
          ],
        },
      ],
      deposits,
      project,
    });
    expect(mocks.getProjectByIdWithClient).toHaveBeenCalledWith(client, "project-1");
    expect(mocks.getPaymentsReceivedByInvoiceId).toHaveBeenCalledWith("invoice-1", client);
    expect(mocks.getDepositsByInvoiceId).toHaveBeenCalledWith("invoice-1", client);
    expect(mocks.getPaymentAttachmentPreviewUrl).toHaveBeenCalledWith(
      paymentsReceived[0].attachments[0],
      client
    );
  });

  it("starts all invoice-dependent reads before a slow item read completes", async () => {
    const items = deferred<DbResult>();
    const { client, starts } = createQueryClient({ items: items.promise });
    mocks.requireRequestClient.mockResolvedValue({ ok: true, client });

    const responsePromise = getInvoiceDetail();
    for (let index = 0; index < 50 && !starts.includes("invoice_items"); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const startsBeforeItemsFinished = [...starts];
    const projectStarted = mocks.getProjectByIdWithClient.mock.calls.length;
    const paymentsReceivedStarted = mocks.getPaymentsReceivedByInvoiceId.mock.calls.length;
    const depositsStarted = mocks.getDepositsByInvoiceId.mock.calls.length;

    items.resolve({ data: itemRows, error: null });
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(startsBeforeItemsFinished).toContain("invoice_items");
    expect(startsBeforeItemsFinished).toContain("invoice_payments");
    expect(projectStarted).toBe(1);
    expect(paymentsReceivedStarted).toBe(1);
    expect(depositsStarted).toBe(1);
  });

  it("keeps a real missing invoice distinct from a database error", async () => {
    const missing = createQueryClient({ invoice: { data: null, error: null } });
    mocks.requireRequestClient.mockResolvedValueOnce({ ok: true, client: missing.client });
    const missingResponse = await getInvoiceDetail("missing");
    expect(missingResponse.status).toBe(404);

    const unavailable = createQueryClient({
      invoice: { data: null, error: { message: "permission denied for table invoices" } },
    });
    mocks.requireRequestClient.mockResolvedValueOnce({ ok: true, client: unavailable.client });
    const unavailableResponse = await getInvoiceDetail("unavailable");
    expect(unavailableResponse.status).toBe(500);
  });

  it.each([
    {
      source: "invoice items",
      configure: () => createQueryClient({ items: { data: null, error: null } }),
    },
    {
      source: "invoice payments",
      configure: () => createQueryClient({ payments: { data: null, error: null } }),
    },
    {
      source: "payments received",
      configure: () => {
        mocks.getPaymentsReceivedByInvoiceId.mockResolvedValueOnce(null);
        return createQueryClient({});
      },
    },
    {
      source: "deposits",
      configure: () => {
        mocks.getDepositsByInvoiceId.mockResolvedValueOnce(null);
        return createQueryClient({});
      },
    },
  ])("fails closed when required $source data is null without an error", async ({ configure }) => {
    const { client } = configure();
    mocks.requireRequestClient.mockResolvedValue({ ok: true, client });

    const response = await getInvoiceDetail();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("preserves genuine empty financial collections as legitimate empty results", async () => {
    const { client } = createQueryClient({
      items: { data: [], error: null },
      payments: { data: [], error: null },
    });
    mocks.requireRequestClient.mockResolvedValue({ ok: true, client });
    mocks.getPaymentsReceivedByInvoiceId.mockResolvedValueOnce([]);
    mocks.getDepositsByInvoiceId.mockResolvedValueOnce([]);

    const response = await getInvoiceDetail();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      payments: [],
      paymentsReceived: [],
      deposits: [],
      invoice: { lineItems: [] },
    });
  });
});
