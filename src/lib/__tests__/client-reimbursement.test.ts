import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { expenseCountsTowardCanonicalProjectCost } from "@/lib/expense-canonical-cost";
import {
  clientReimbursementOutstandingAmount,
  jobCostWithClientReimbursement,
  reimbursementRequestLinesAreCompatible,
} from "@/lib/client-reimbursement";
import { buildClientReimbursementPdf } from "@/lib/client-reimbursement-pdf";

describe("client reimbursement job cost", () => {
  const lines = [
    {
      clientReimbursable: true,
      clientReimbursementStatus: "not_requested",
      amount: 40,
      expenseStatus: "approved",
    },
    {
      clientReimbursable: true,
      clientReimbursementStatus: "requested",
      amount: 25.5,
      expenseStatus: "approved",
    },
    {
      clientReimbursable: true,
      clientReimbursementStatus: "reimbursed",
      amount: 80,
      expenseStatus: "approved",
    },
    {
      clientReimbursable: false,
      amount: 15,
      expenseStatus: "approved",
    },
  ];

  it("keeps reimbursable expenses in job cost and reports outstanding separately", () => {
    const before = jobCostWithClientReimbursement({ expenseCost: 160.5, lines });
    expect(before.expenseCost).toBe(160.5);
    expect(before.reimbursableOutstanding).toBe(65.5);

    const afterPayment = jobCostWithClientReimbursement({
      expenseCost: 160.5,
      lines: lines.map((line) =>
        line.clientReimbursementStatus === "requested"
          ? { ...line, clientReimbursementStatus: "reimbursed" }
          : line
      ),
    });
    expect(afterPayment.expenseCost).toBe(before.expenseCost);
    expect(afterPayment.reimbursableOutstanding).toBe(40);
    expect(clientReimbursementOutstandingAmount(lines[2]!)).toBe(0);
  });

  it("does not drop an approved reimbursable expense from canonical cost", () => {
    expect(
      expenseCountsTowardCanonicalProjectCost({
        status: "approved",
        reference_no: "INV-100",
        inbox_capture: false,
      })
    ).toBe(true);
  });

  it("rejects a request that mixes projects or already requested lines", () => {
    expect(
      reimbursementRequestLinesAreCompatible([
        { projectId: "p1", status: "not_requested" },
        { projectId: "p2", status: "not_requested" },
      ])
    ).toMatch(/one project/);
    expect(
      reimbursementRequestLinesAreCompatible([{ projectId: "p1", status: "requested" }])
    ).toMatch(/not included/);
    expect(
      reimbursementRequestLinesAreCompatible([{ projectId: "p1", status: "not_requested" }])
    ).toBeNull();
  });
});

describe("client reimbursement PDF", () => {
  it("prints the company header, request number, and appends a receipt page", async () => {
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    const bytes = await buildClientReimbursementPdf({
      requestNo: "CR-20260929-0007",
      requestedOn: "2026-09-29",
      clientName: "Aloha Client",
      projectName: "Kaimuki Remodel",
      projectAddress: "100 Waialae Ave, Honolulu HI",
      lines: [
        {
          date: "2026-09-18",
          vendor: "Island Hardware",
          invoiceNumber: "INV-2201",
          description: "Fasteners",
          amount: 126.4,
        },
      ],
      receipts: [{ fileName: "receipt.png", bytes: png }],
    });
    const raw = Buffer.from(bytes);
    expect(raw.subarray(0, 5).toString()).toBe("%PDF-");
    const inflated = [...raw.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map((match) => {
        try {
          return inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1");
        } catch {
          return "";
        }
      })
      .join("\n");
    const visible = inflated.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) =>
      hex.length % 2 === 0 ? Buffer.from(hex, "hex").toString("latin1") : ""
    );
    expect(visible).toContain("HH Constructions");
    expect(visible).toContain("CR-20260929-0007");
    expect(visible).toContain("Island Hardware");
    expect(visible).toContain("Total due");
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
  });
});
