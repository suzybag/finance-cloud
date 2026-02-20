type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitPolicy = {
  windowMs: number;
  max: number;
};

const RATE_LIMIT_STORE = new Map<string, RateLimitEntry>();

const nowMs = () => Date.now();

export const checkRateLimit = ({
  key,
  max,
  windowMs,
}: {
  key: string;
  max: number;
  windowMs: number;
}): RateLimitResult => {
  const now = nowMs();
  const current = RATE_LIMIT_STORE.get(key);

  if (!current || current.expiresAt <= now) {
    const expiresAt = now + windowMs;
    RATE_LIMIT_STORE.set(key, { count: 1, expiresAt });
    return {
      allowed: true,
      remaining: Math.max(max - 1, 0),
      limit: max,
      resetAt: expiresAt,
      retryAfterSeconds: Math.max(Math.ceil(windowMs / 1000), 1),
    };
  }

  const nextCount = current.count + 1;
  RATE_LIMIT_STORE.set(key, { count: nextCount, expiresAt: current.expiresAt });

  const allowed = nextCount <= max;
  const remaining = Math.max(max - nextCount, 0);
  const retryAfterSeconds = Math.max(Math.ceil((current.expiresAt - now) / 1000), 1);

  return {
    allowed,
    remaining,
    limit: max,
    resetAt: current.expiresAt,
    retryAfterSeconds,
  };
};

export const getRateLimitPolicy = (pathname: string): RateLimitPolicy => {
  const path = pathname.toLowerCase();

  if (path.startsWith("/api/auth/login/start")) {
    return { windowMs: 60_000, max: 20 };
  }

  if (path.startsWith("/api/auth/login/verify-otp")) {
    return { windowMs: 60_000, max: 30 };
  }

  if (path.startsWith("/api/open-finance/token")) {
    return { windowMs: 60_000, max: 20 };
  }

  if (path.startsWith("/api/backups/daily")) {
    return { windowMs: 60_000, max: 5 };
  }

  if (path.startsWith("/api/maintenance/supabase-trim")) {
    return { windowMs: 60_000, max: 5 };
  }

  if (path.startsWith("/api/investments/security/snapshot")) {
    return { windowMs: 60_000, max: 20 };
  }

  if (
    path.startsWith("/api/ai/")
    || path.startsWith("/api/whatsapp/")
    || path.startsWith("/api/push/test")
  ) {
    return { windowMs: 60_000, max: 30 };
  }

  if (
    path.startsWith("/api/automations/run")
    || path.startsWith("/api/reports/monthly/run")
    || path.startsWith("/api/agenda/reminders/run")
    || path.startsWith("/api/banking/relationship/run")
  ) {
    return { windowMs: 60_000, max: 15 };
  }

  return { windowMs: 60_000, max: 100 };
};

export const compactRateLimitStore = () => {
  const now = nowMs();
  for (const [key, value] of RATE_LIMIT_STORE.entries()) {
    if (value.expiresAt <= now) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
};
