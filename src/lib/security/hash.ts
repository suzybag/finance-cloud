import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const BCRYPT_ROUNDS = Number(process.env.SECRET_HASH_ROUNDS || "12");

export const hashSecret = async (secret: string) => {
  const rounds = Number.isFinite(BCRYPT_ROUNDS) ? Math.max(10, Math.min(BCRYPT_ROUNDS, 14)) : 12;
  return bcrypt.hash(secret, rounds);
};

export const verifySecret = async (secret: string, hash: string) => bcrypt.compare(secret, hash);

export const generateOtpCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
