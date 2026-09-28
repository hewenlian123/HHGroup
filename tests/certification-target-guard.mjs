import assert from "node:assert/strict";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function target(value, label, protocols) {
  assert.ok(value?.trim(), `${label} is required for disposable certification target proof`);
  const url = new URL(value);
  assert.ok(protocols.includes(url.protocol), `${label} protocol is not allowed`);
  assert.ok(LOOPBACK.has(url.hostname), `${label} must use a loopback host`);
  assert.ok(url.port, `${label} requires an explicit port`);
  return url;
}

function assertDisposablePort(url, label) {
  const port = Number(url.port);
  assert.ok(
    port >= 57000 && port <= 57999,
    `${label} must use the disposable certification port allowlist 57000-57999`
  );
}

export function assertDisposableCertificationTarget({ expected, actual }) {
  assert.match(
    expected?.projectId ?? "",
    /^hh-t8-cert-[a-z0-9-]+$/,
    "Expected project id must identify a disposable certification target"
  );
  assert.equal(actual?.projectId, expected.projectId, "Actual project id differs from expected");

  const expectedApi = target(expected.apiUrl, "Expected API URL", ["http:"]);
  const actualApi = target(actual?.apiUrl, "Actual API URL", ["http:"]);
  const expectedDb = target(expected.databaseUrl, "Expected database URL", [
    "postgres:",
    "postgresql:",
  ]);
  const actualDb = target(actual?.databaseUrl, "Actual database URL", ["postgres:", "postgresql:"]);

  assertDisposablePort(expectedApi, "Expected API URL");
  assertDisposablePort(expectedDb, "Expected database URL");
  assert.equal(expectedDb.pathname, "/postgres", "Expected database name must be postgres");
  assert.equal(actualDb.pathname, "/postgres", "Actual database name must be postgres");
  assert.equal(actualApi.origin, expectedApi.origin, "Actual API target differs from expected");
  assert.equal(actualDb.hostname, expectedDb.hostname, "Actual DB host differs from expected");
  assert.equal(actualDb.port, expectedDb.port, "Actual DB port differs from expected");
}
