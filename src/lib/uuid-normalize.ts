/** Compare UUID strings ignoring hyphen placement and case (URL vs Postgres). */
export function uuidNormalizedEqual(a: string, b: string): boolean {
  const n = (s: string) => String(s).replace(/-/g, "").toLowerCase();
  return n(a) === n(b);
}
