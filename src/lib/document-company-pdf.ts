import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";
import type { jsPDF } from "jspdf";

type JsPdfLike = jsPDF;

export const DOCUMENT_COMPANY_FALLBACK: DocumentCompanyProfileDTO = {
  companyName: "HH Group",
  phone: null,
  email: null,
  website: null,
  licenseNumber: null,
  taxId: null,
  invoiceFooter: null,
  defaultTerms: null,
  notes: null,
  addressLines: [],
  logoUrl: null,
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function normalizeDocumentCompanyProfile(
  company: Partial<DocumentCompanyProfileDTO> | null | undefined
): DocumentCompanyProfileDTO {
  return {
    ...DOCUMENT_COMPANY_FALLBACK,
    ...company,
    companyName: clean(company?.companyName) ?? DOCUMENT_COMPANY_FALLBACK.companyName,
    phone: clean(company?.phone),
    email: clean(company?.email),
    website: clean(company?.website),
    licenseNumber: clean(company?.licenseNumber),
    taxId: clean(company?.taxId),
    invoiceFooter: clean(company?.invoiceFooter),
    defaultTerms: clean(company?.defaultTerms),
    notes: clean(company?.notes),
    logoUrl: clean(company?.logoUrl),
    addressLines: (company?.addressLines ?? []).map((line) => line.trim()).filter(Boolean),
  };
}

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function logoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!contentType.startsWith("image/")) return null;
    const base64 = base64FromArrayBuffer(await res.arrayBuffer());
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function drawLogoContain(
  doc: JsPdfLike,
  dataUrl: string,
  x: number,
  y: number,
  size: number
): void {
  if (!doc.addImage) return;
  try {
    const props = doc.getImageProperties?.(dataUrl);
    const ratio = props?.width && props?.height ? props.width / props.height : 1;
    const w = ratio >= 1 ? size : size * ratio;
    const h = ratio >= 1 ? size / ratio : size;
    doc.addImage(dataUrl, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } catch {
    // Missing/cached/unsupported logos should never break PDF generation.
  }
}

export async function addDocumentCompanyPdfHeader(
  doc: JsPdfLike,
  companyInput: Partial<DocumentCompanyProfileDTO> | null | undefined,
  options: {
    title: string;
    documentNo?: string | null;
    documentDate?: string | null;
    documentNoLabel?: string;
    y?: number;
    left?: number;
    right?: number;
  }
): Promise<number> {
  const company = normalizeDocumentCompanyProfile(companyInput);
  const left = options.left ?? 20;
  const right = options.right ?? 190;
  const logoSize = 16;
  const y = options.y ?? 16;
  const logo = await logoDataUrl(company.logoUrl);

  if (logo) {
    drawLogoContain(doc, logo, left, y - 2, logoSize);
  }

  const textX = logo ? left + logoSize + 5 : left;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(company.companyName, textX, y + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let infoY = y + 8;
  const lines = [
    ...company.addressLines,
    company.phone,
    company.email,
    company.website,
    company.licenseNumber ? `License: ${company.licenseNumber}` : null,
    company.taxId ? `Tax ID: ${company.taxId}` : null,
  ].filter(Boolean) as string[];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 72);
    doc.text(wrapped, textX, infoY);
    infoY += Math.max(4, wrapped.length * 3.5);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(options.title, right, y + 3, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const documentNo = clean(options.documentNo);
  if (documentNo) {
    doc.text(`${options.documentNoLabel ?? "Document No"}: ${documentNo}`, right, y + 10, {
      align: "right",
    });
  }
  const documentDate = clean(options.documentDate);
  if (documentDate) {
    doc.text(`Date: ${documentDate}`, right, y + (documentNo ? 15 : 10), { align: "right" });
  }

  const nextY = Math.max(infoY + 4, y + 24);
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(left, nextY, right, nextY);
  return nextY + 8;
}

export function addDocumentCompanyPdfFooter(
  doc: JsPdfLike,
  companyInput: Partial<DocumentCompanyProfileDTO> | null | undefined,
  options: { y: number; left?: number; maxWidth?: number; fallback?: string }
): number {
  const company = normalizeDocumentCompanyProfile(companyInput);
  const text = company.invoiceFooter || company.defaultTerms || options.fallback;
  if (!text) return options.y;
  const left = options.left ?? 20;
  const maxWidth = options.maxWidth ?? 170;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, left, options.y);
  doc.setTextColor(0, 0, 0);
  return options.y + Math.max(5, lines.length * 4);
}
