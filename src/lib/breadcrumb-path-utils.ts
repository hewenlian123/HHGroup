/** Standard UUID (any variant) in path segments. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLikelyUuidSegment(segment: string): boolean {
  return UUID_RE.test(segment.trim());
}

/**
 * Index of the rightmost path segment that looks like a UUID (entity id before trailing
 * static segments like `edit`, `balance`, `print`).
 */
export function findRightmostUuidSegmentIndex(parts: string[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isLikelyUuidSegment(parts[i])) return i;
  }
  return -1;
}
