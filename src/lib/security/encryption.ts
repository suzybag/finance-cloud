import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTION_PREFIX = "v1";
const IV_LENGTH = 12;

const resolveKey = (raw: string) => {
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const maybeBase64 = Buffer.from(raw, "base64");
  if (maybeBase64.length === 32) return maybeBase64;

  // Fallback for passphrases: derive a stable 32-byte key.
  return createHash("sha256").update(raw, "utf8").digest();
};

const resolveKeys = () => {
  // Keep APP_ENCRYPTION_KEY as the primary source and only fallback to avoid login/API downtime.
  const candidates = [
    (process.env.APP_ENCRYPTION_KEY ?? "").trim(),
    (process.env.CRON_SECRET ?? "").trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
  ];

  const keys: Buffer[] = [];
  for (const candidate of candidates) {
    const resolved = resolveKey(candidate);
    if (resolved) keys.push(resolved);
  }
  return keys;
};

const ENCRYPTION_KEYS = resolveKeys();

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
  const key = ENCRYPTION_KEYS[0];
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY nao configurada.");
  }
  return key;
};

export const hasEncryptionKey = () => ENCRYPTION_KEYS.length > 0;

export const encryptText = (plaintext: string) => {
  const key = requireEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}.${toB64Url(iv)}.${toB64Url(tag)}.${toB64Url(ciphertext)}`;
};

export const decryptText = (payload: string) => {
  requireEncryptionKey();
  const [prefix, ivPart, tagPart, dataPart] = String(payload || "").split(".");
  if (prefix !== ENCRYPTION_PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error("Payload criptografado invalido.");
  }

  const iv = fromB64Url(ivPart);
  const tag = fromB64Url(tagPart);
  const ciphertext = fromB64Url(dataPart);

  let decryptError: unknown = null;
  for (const key of ENCRYPTION_KEYS) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString("utf8");
    } catch (error) {
      decryptError = error;
    }
  }

  if (decryptError instanceof Error) {
    throw new Error("Payload criptografado invalido.");
  }

  throw new Error("Falha ao descriptografar payload.");
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
