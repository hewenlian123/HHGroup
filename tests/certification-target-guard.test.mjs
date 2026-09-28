import assert from "node:assert/strict";
import test from "node:test";

import { assertDisposableCertificationTarget } from "./certification-target-guard.mjs";

const expected = {
  projectId: "hh-t8-cert-57321",
  apiUrl: "http://127.0.0.1:57321",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
};

test("disposable certification target must match before a write can run", () => {
  let writes = 0;
  const write = (actual) => {
    assertDisposableCertificationTarget({ expected, actual });
    writes += 1;
  };

  assert.throws(
    () =>
      write({
        projectId: "hh-unified-web",
        apiUrl: "http://127.0.0.1:54321",
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
    /project id differs/i
  );
  assert.equal(writes, 0, "wrong target aborts before write callback");

  write(expected);
  assert.equal(writes, 1);
});

test("hosted, mismatched, and non-postgres targets are refused", () => {
  for (const actual of [
    { ...expected, apiUrl: "https://example.supabase.co" },
    { ...expected, apiUrl: "http://192.0.2.1:57321" },
    { ...expected, apiUrl: "http://127.0.0.1:57323" },
    { ...expected, databaseUrl: expected.databaseUrl.replace("57322", "57323") },
    { ...expected, databaseUrl: "postgresql://postgres:postgres@127.0.0.1:57322/business" },
    { ...expected, projectId: "hh-t8-cert-other" },
  ]) {
    assert.throws(() => assertDisposableCertificationTarget({ expected, actual }));
  }
});

test("missing and canonical local targets abort before write", () => {
  for (const candidate of [
    { expected: { ...expected, apiUrl: undefined }, actual: expected },
    {
      expected: {
        projectId: "hh-t8-cert-default",
        apiUrl: "http://127.0.0.1:54321",
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      },
      actual: {
        projectId: "hh-t8-cert-default",
        apiUrl: "http://127.0.0.1:54321",
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      },
    },
  ]) {
    let writes = 0;
    assert.throws(() => {
      assertDisposableCertificationTarget(candidate);
      writes += 1;
    });
    assert.equal(writes, 0);
  }
});
