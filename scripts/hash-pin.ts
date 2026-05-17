import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 210_000;

function usage(): never {
  console.error("Usage: npm run auth:hash-pin -- <4-digit-pin>");
  process.exit(1);
}

const pin = process.argv[2]?.trim();
if (!pin || !/^\d{4}$/.test(pin)) {
  usage();
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(pin, salt, ITERATIONS, 32, "sha256");

console.log("Manual recovery values for public.app_security_settings only.");
console.log("Do not store the PIN hash/salt in NEXT_PUBLIC or Vercel app env.");
console.log(`pin_salt=${salt.toString("base64url")}`);
console.log(`pin_hash=${hash.toString("base64url")}`);
