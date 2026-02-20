import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTION_KEY_ENV = (process.env.APP_ENCRYPTION_KEY ?? "").trim();
const ENCRYPTION_PREFIX = "v1";
const IV_LENGTH = 12;

const resolveKey = () => {
  if (!ENCRYPTION_KEY_ENV) return null;
  if (/^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY_ENV)) {
    return Buffer.from(ENCRYPTION_KEY_ENV, "hex");
  }

  const maybeBase64 = Buffer.from(ENCRYPTION_KEY_ENV, "base64");
  if (maybeBase64.length === 32) return maybeBase64;

  // Fallback for passphrases: derive a stable 32-byte key.
  return createHash("sha256").update(ENCRYPTION_KEY_ENV, "utf8").digest();
};

const ENCRYPTION_KEY = resolveKey();

const toB64Url = (value: Buffer) =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromB64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64");
};

const requireEncryptionKey = () => {
  if (!ENCRYPTION_KEY) {
    throw new Error("APP_ENCRYPTION_KEY nao configurada.");
  }
  return ENCRYPTION_KEY;
};

export const hasEncryptionKey = () => !!ENCRYPTION_KEY;

export const encryptText = (plaintext: string) => {
  const key = requireEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(ciphertext)}`;
};

export const decryptText = (payload: string) => {
  const key = requireEncryptionKey();
  const [prefix, ivPart, tagPart, dataPart] = String(payload || "").split(".");
  if (prefix !== ENCRYPTION_PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error("Payload criptografado invalido.");
  }

  const iv = fromB64Url(ivPart);
  const tag = fromB64Url(tagPart);
  const ciphertext = fromB64Url(dataPart);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
};

export const encryptJson = (value: unknown) => encryptText(JSON.stringify(value ?? null));

export const decryptJson = <T>(payload: string): T => {
  const decoded = decryptText(payload);
  return JSON.parse(decoded) as T;
};

export const sha256Hex = (value: string) =>
  createHash("sha256").update(String(value || ""), "utf8").digest("hex");

export const buildTokenReference = (prefix: string, value: string) => {
  const digest = sha256Hex(value);
  return `${prefix}_${digest.slice(0, 24)}`;
};
