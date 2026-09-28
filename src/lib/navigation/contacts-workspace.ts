export const contactSections = [
  { href: "/customers/overview", label: "Overview" },
  { href: "/customers", label: "Customers" },
  { href: "/subcontractors", label: "Subcontractors" },
  { href: "/vendors", label: "Vendors" },
] as const;

export function contactActiveSection(path: string) {
  if (path === "/customers/overview") return "Overview";
  if (/^\/(?:labor\/)?subcontractors(?:\/|$)/.test(path)) return "Subcontractors";
  if (/^\/(?:(?:financial|people)\/)?vendors(?:\/|$)/.test(path)) return "Vendors";
  return "Customers";
}

export function contactMatches(query: string, fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  return !q || fields.some((value) => value?.toLowerCase().includes(q));
}
