import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
};

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:alerts@finance-cloud.local";

let configured = false;

export const hasPushConfig = () =>
  !!vapidPublicKey && !!vapidPrivateKey;

export const getVapidPublicKey = () => vapidPublicKey;

const ensureWebPushConfigured = () => {
  if (configured || !hasPushConfig()) return;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
};

const toWebPushSubscription = (row: PushSubscriptionRow) => ({
  endpoint: row.endpoint,
  keys: {
    p256dh: row.p256dh,
    auth: row.auth,
  },
});

const isGoneError = (statusCode?: number) => statusCode === 404 || statusCode === 410;

export const sendPushToUser = async ({
  admin,
  userId,
  payload,
}: {
  admin: SupabaseClient;
  userId: string;
  payload: PushPayload;
}) => {
  if (!hasPushConfig()) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message: "VAPID nao configurado.",
    };
  }

  ensureWebPushConfigured();

  const subscriptionsRes = await admin
    .from("subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, active")
    .eq("user_id", userId)
    .eq("active", true);

  if (subscriptionsRes.error) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      message: subscriptionsRes.error.message,
    };
  }

  const subscriptions = (subscriptionsRes.data || []) as PushSubscriptionRow[];
  if (!subscriptions.length) {
    return {
      ok: true,
      sent: 0,
      failed: 0,
      message: "Usuario sem subscriptions ativas.",
    };
  }

  let sent = 0;
  let failed = 0;

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: {
      url: payload.url || "/dashboard",
      tag: payload.tag || "finance-cloud-alert",
    },
  });

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(toWebPushSubscription(row), payloadString, {
        TTL: 60,
        urgency: "normal",
      });
      sent += 1;
      await admin
        .from("subscriptions")
        .update({
          last_success_at: new Date().toISOString(),
          last_failure_at: null,
          failure_reason: null,
        })
        .eq("id", row.id);
    } catch (error) {
      failed += 1;
      const err = error as { statusCode?: number; body?: string; message?: string };
      const message = (err.body || err.message || "Falha no envio push.").slice(0, 500);

      await admin
        .from("subscriptions")
        .update({
          active: !isGoneError(err.statusCode),
          last_failure_at: new Date().toISOString(),
          failure_reason: message,
        })
        .eq("id", row.id);
    }
  }

  return {
    ok: true,
    sent,
    failed,
    message: null,
  };
};
