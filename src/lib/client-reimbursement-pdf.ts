import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { roundMoney } from "@/lib/money";

export type ClientReimbursementPdfLine = {
  date: string;
  vendor: string;
  invoiceNumber: string;
  description: string;
  amount: number;
};

export type ClientReimbursementPdfReceipt = {
  fileName: string;
  bytes: Uint8Array;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;

function money(amount: number): string {
  return roundMoney(amount).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function drawRequestPage(
  pdf: PDFDocument,
  input: {
    requestNo: string;
    requestedOn: string;
    clientName: string;
    projectName: string;
    projectAddress: string;
    lines: ClientReimbursementPdfLine[];
  }
) {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  page.drawText("HH Constructions", {
    x: MARGIN,
    y,
    size: 20,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 28;
  page.drawText("Client reimbursement request", {
    x: MARGIN,
    y,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 22;
  page.drawText(`Request ${input.requestNo}`, { x: MARGIN, y, size: 11, font: bold });
  page.drawText(input.requestedOn, { x: PAGE_WIDTH - MARGIN - 80, y, size: 11, font });
  y -= 18;
  page.drawText(clip(`Client: ${input.clientName || "Client"}`, 80), {
    x: MARGIN,
    y,
    size: 11,
    font,
  });
  y -= 16;
  page.drawText(clip(`Project: ${input.projectName}`, 80), { x: MARGIN, y, size: 11, font });
  y -= 16;
  page.drawText(clip(input.projectAddress || "Project address not on file", 90), {
    x: MARGIN,
    y,
    size: 11,
    font,
  });
  y -= 28;

  const columns = [MARGIN, 120, 250, 360, 470];
  const headers = ["Date", "Vendor", "Invoice", "Description", "Amount"];
  headers.forEach((header, index) => {
    page.drawText(header, { x: columns[index]!, y, size: 9, font: bold });
  });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.6,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 16;

  for (const line of input.lines) {
    if (y < 90) break;
    const cells = [
      line.date,
      clip(line.vendor, 18),
      clip(line.invoiceNumber || "—", 14),
      clip(line.description || "—", 16),
      money(line.amount),
    ];
    cells.forEach((cell, index) => {
      page.drawText(cell, { x: columns[index]!, y, size: 9, font });
    });
    y -= 16;
  }

  const total = roundMoney(input.lines.reduce((sum, line) => sum + line.amount, 0));
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y: y + 12 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 12 },
    thickness: 0.6,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText("Total due", { x: 400, y, size: 12, font: bold });
  page.drawText(money(total), { x: 480, y, size: 12, font: bold });
  y -= 28;
  page.drawText("Receipt copies follow as backup.", {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
}

async function appendReceipt(pdf: PDFDocument, receipt: ClientReimbursementPdfReceipt) {
  const bytes = receipt.bytes;
  const isPdf =
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;
  if (isPdf) {
    const source = await PDFDocument.load(bytes);
    const pages = await pdf.copyPages(source, source.getPageIndices());
    pages.forEach((page) => pdf.addPage(page));
    return;
  }
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpg) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(`Backup receipt could not be embedded: ${clip(receipt.fileName, 60)}`, {
      x: MARGIN,
      y: PAGE_HEIGHT - MARGIN,
      size: 12,
      font,
    });
    return;
  }
  const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const maxHeight = PAGE_HEIGHT - MARGIN * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
  });
}

export async function buildClientReimbursementPdf(input: {
  requestNo: string;
  requestedOn: string;
  clientName: string;
  projectName: string;
  projectAddress: string;
  lines: ClientReimbursementPdfLine[];
  receipts: ClientReimbursementPdfReceipt[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  await drawRequestPage(pdf, input);
  for (const receipt of input.receipts) {
    await appendReceipt(pdf, receipt);
  }
  pdf.setTitle(`HH Constructions ${input.requestNo}`);
  pdf.setSubject(input.lines.map((line) => line.vendor).join(", "));
  return pdf.save({ useObjectStreams: false });
}
