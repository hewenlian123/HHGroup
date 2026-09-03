export type RequestAuthorization =
  | { kind: "absent" }
  | { kind: "malformed" }
  | { kind: "bearer"; token: string; authorization: string };

/**
 * Parse the request Authorization value once so verification and database
 * queries share the same normalized Bearer credential.
 */
export function parseRequestAuthorization(authorization: string | null): RequestAuthorization {
  if (authorization === null) return { kind: "absent" };

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return { kind: "malformed" };

  const token = match[1];
  return { kind: "bearer", token, authorization: `Bearer ${token}` };
}
