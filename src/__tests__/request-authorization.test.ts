import { describe, expect, it } from "vitest";
import { parseRequestAuthorization } from "@/lib/request-authorization";

describe("request Authorization parsing", () => {
  it.each([
    [null, { kind: "absent" }],
    [
      "Bearer owner.token",
      { kind: "bearer", token: "owner.token", authorization: "Bearer owner.token" },
    ],
    [
      "bearer owner.token",
      { kind: "bearer", token: "owner.token", authorization: "Bearer owner.token" },
    ],
    [
      "BEARER\towner.token",
      { kind: "bearer", token: "owner.token", authorization: "Bearer owner.token" },
    ],
    [
      "Bearer   owner.token",
      { kind: "bearer", token: "owner.token", authorization: "Bearer owner.token" },
    ],
    ["Basic owner.token", { kind: "malformed" }],
    ["Bearer ", { kind: "malformed" }],
  ])("normalizes %j", (header, expected) => {
    expect(parseRequestAuthorization(header)).toEqual(expected);
  });
});
