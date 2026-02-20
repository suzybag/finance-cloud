import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  compactRateLimitStore,
  getRateLimitPolicy,
} from "@/lib/security/rateLimit";
import {
  getClientIp,
  isHttpsRequest,
  isSameOriginRequest,
} from "@/lib/security/requestContext";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PREFIXES = [
  "/api/whatsapp/webhook",
  "/api/alerts-smart/run",
  "/api/investments/refresh-prices",
  "/api/reports/monthly/run",
  "/api/automations/run",
  "/api/banking/relationship/run",
  "/api/agenda/reminders/run",
  "/api/backups/daily",
  "/api/maintenance/supabase-trim",
];

const buildCsp = () => {
  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "https://api.openai.com",
    "https://api.resend.com",
    "https://api.brevo.com",
  ];

  if (!IS_PRODUCTION) {
    connectSrc.push("http://localhost:*", "ws://localhost:*");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob: https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSrc.join(" ")}`,
    "form-action 'self'",
  ].join("; ");
};

const CONTENT_SECURITY_POLICY = buildCsp();

const isApiPath = (pathname: string) => pathname.startsWith("/api/");

const isCsrfExemptPath = (pathname: string) =>
  CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const shouldRedirectToHttps = (req: NextRequest) => {
  if (!IS_PRODUCTION) return false;
  if (req.nextUrl.hostname === "localhost") return false;
  return !isHttpsRequest(req);
};

const applySecurityHeaders = (response: NextResponse) => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (IS_PRODUCTION) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return response;
};

export function middleware(req: NextRequest) {
  if (shouldRedirectToHttps(req)) {
    const target = req.nextUrl.clone();
    target.protocol = "https";
    const redirect = NextResponse.redirect(target, 308);
    return applySecurityHeaders(redirect);
  }

  if (req.method === "OPTIONS") {
    return applySecurityHeaders(NextResponse.next());
  }

  const { pathname } = req.nextUrl;

  if (isApiPath(pathname)) {
    compactRateLimitStore();

    const policy = getRateLimitPolicy(pathname);
    const ip = getClientIp(req) || "unknown";
    const key = `${ip}:${pathname}:${req.method}`;

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
      return applySecurityHeaders(response);
    }

    if (
      MUTATING_METHODS.has(req.method)
      && !isCsrfExemptPath(pathname)
      && !isSameOriginRequest(req)
    ) {
      const response = NextResponse.json(
        { message: "Requisicao bloqueada por protecao CSRF." },
        { status: 403 },
      );
      return applySecurityHeaders(response);
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.resetAt));
    return applySecurityHeaders(response);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
