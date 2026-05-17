import { createHash, randomBytes, pbkdf2Sync } from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

export function hashAdministratorPassword(
  password: string,
  salt?: string
): { hash: string; salt: string } {
  const passwordSalt = salt ?? randomBytes(32).toString("hex");
  const hash = pbkdf2Sync(
    password,
    passwordSalt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST
  ).toString("hex");
  return { hash, salt: passwordSalt };
}

/** Legacy helper if SHA paths exist elsewhere */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
