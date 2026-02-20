const b64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const withPadding = `${normalized}${"=".repeat(padding)}`;
  return Buffer.from(withPadding, "base64").toString("utf8");
};

export type JwtPayload = {
  sub?: string;
  exp?: number;
  iat?: number;
  aud?: string | string[];
};

export const decodeJwtPayload = (token: string): JwtPayload | null => {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(b64UrlDecode(parts[1]));
    if (typeof payload !== "object" || payload === null) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
};

export const getJwtExpirationMs = (token: string) => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp || !Number.isFinite(payload.exp)) return null;
  return payload.exp * 1000;
};

export const isJwtExpired = (token: string, skewSeconds = 30) => {
  const expMs = getJwtExpirationMs(token);
  if (!expMs) return false;
  return Date.now() >= expMs - Math.max(0, skewSeconds) * 1000;
};
