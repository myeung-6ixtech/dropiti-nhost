import crypto from "node:crypto";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CHAT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CHAT_ENCRYPTION_KEY environment variable is required");
  }
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }
  return crypto.pbkdf2Sync(key, "dropiti-chat-salt", 100000, KEY_LENGTH, "sha256");
}

export function encryptMessage(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const combined = Buffer.concat([iv, Buffer.from(encrypted, "base64")]);
  return combined.toString("base64");
}

export function decryptMessage(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isEncrypted(data: string): boolean {
  try {
    const combined = Buffer.from(data, "base64");
    return combined.length >= IV_LENGTH;
  } catch {
    return false;
  }
}

export function decryptContentSafe(content: string): string {
  try {
    return isEncrypted(content) ? decryptMessage(content) : content;
  } catch {
    return "[Message could not be decrypted]";
  }
}
