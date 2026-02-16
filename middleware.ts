import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  compactRateLimitStore,
  getRateLimitPolicy,
} from "@/lib/security/rateLimit";

const getClientIp = (req: NextRequest) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
};

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return NextResponse.next();
  }

  compactRateLimitStore();

  const { pathname } = req.nextUrl;
  const policy = getRateLimitPolicy(pathname);
  const ip = getClientIp(req);
  const key = `${ip}:${pathname}`;

  const result = checkRateLimit({
    key,
    max: policy.max,
    windowMs: policy.windowMs,
  });

  if (!result.allowed) {
    const response = NextResponse.json(
      {
        message: "Muitas requisicoes. Tente novamente em instantes.",
      },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.resetAt));
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.resetAt));
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};

