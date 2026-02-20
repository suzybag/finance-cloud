import { NextRequest } from "next/server";

export const getClientIp = (req: NextRequest) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
};

const normalizeHost = (value: string) => value.trim().toLowerCase();

export const isSameOriginRequest = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const originHost = normalizeHost(new URL(origin).host);
    const forwardedHost = req.headers.get("x-forwarded-host");
    const host = req.headers.get("host");
    const expectedHost = normalizeHost(forwardedHost || host || "");
    if (!expectedHost) return false;
    return originHost === expectedHost;
  } catch {
    return false;
  }
};

export const isHttpsRequest = (req: NextRequest) => {
  const proto = (req.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (proto) return proto === "https";
  const urlProtocol = req.nextUrl.protocol.toLowerCase();
  return urlProtocol === "https:";
};
