export const SCOPE_SOFT_BREAK = "\u2028";

const MAX_INDENT = 8;

export type ScopeBulletRow = {
  id: string;
  indent: number;
  text: string;
};

/** Read-only bullet line (no editor ids). */
export type ProposalScopeBulletRead = {
  indent: number;
  text: string;
};

function makeRowId(): string {
  return `sb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyScopeRow(indent = 0): ScopeBulletRow {
  return { id: makeRowId(), indent: Math.min(Math.max(0, indent), MAX_INDENT), text: "" };
}

/**
 * Parse persisted proposal scope for read-only display.
 * Leading `\t` = indent; U+2028 within a physical line = soft line break inside one bullet.
 */
export function parseProposalScopeLines(raw: string | null | undefined): ProposalScopeBulletRead[] {
  const normalized = (raw ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return [];
  return normalized.split("\n").map((line) => {
    let indent = 0;
    let rest = line;
    while (rest.startsWith("\t") && indent < MAX_INDENT) {
      indent += 1;
      rest = rest.slice(1);
    }
    const text = rest.split(SCOPE_SOFT_BREAK).join("\n");
    return { indent, text };
  });
}

/** Parse persisted scope string into editable rows (leading tabs = indent). */
export function parseScopeStorage(raw: string): ScopeBulletRow[] {
  const normalized = (raw ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return [createEmptyScopeRow()];
  return parseProposalScopeLines(normalized).map((b) => ({
    ...b,
    id: makeRowId(),
  }));
}

/** Persist rows: one physical line per bullet; soft breaks as U+2028. */
export function serializeScopeStorage(rows: ScopeBulletRow[]): string {
  const normalized = rows.map((r) => ({
    indent: Math.min(Math.max(0, r.indent), MAX_INDENT),
    text: r.text.replace(/\r\n/g, "\n"),
  }));
  const onlyEmpty =
    normalized.length === 1 &&
    normalized[0].indent === 0 &&
    !normalized[0].text.replace(/\n/g, "").trim();
  if (onlyEmpty) return "";

  return normalized
    .map((r) => {
      const escaped = r.text.replace(/\n/g, SCOPE_SOFT_BREAK);
      return `${"\t".repeat(r.indent)}${escaped}`;
    })
    .join("\n");
}
