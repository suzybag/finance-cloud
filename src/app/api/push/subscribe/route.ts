import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type WebPushBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

const isMissingSubscriptionsTable = (message?: string | null) =>
  /relation .*subscriptions/i.test(message || "");

const parseSubscriptionBody = (body: unknown): WebPushBody | null => {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const candidate = (raw.subscription && typeof raw.subscription === "object"
    ? raw.subscription
    : raw) as Record<string, unknown>;

  const endpoint = typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : "";
  const keysRaw = (candidate.keys && typeof candidate.keys === "object"
    ? candidate.keys
    : {}) as Record<string, unknown>;
  const p256dh = typeof keysRaw.p256dh === "string" ? keysRaw.p256dh.trim() : "";
  const auth = typeof keysRaw.auth === "string" ? keysRaw.auth.trim() : "";

  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
  };
};

export async function GET(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const { data, error: listError } = await client
    .from("subscriptions")
    .select("id, endpoint, active, created_at, updated_at, last_success_at, last_failure_at, failure_reason")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (listError) {
    if (isMissingSubscriptionsTable(listError.message)) {
      return NextResponse.json({
        ok: true,
        subscriptions: [],
        warning: "Tabela subscriptions nao encontrada. Rode o supabase.sql atualizado.",
      });
    }
    return NextResponse.json({ ok: false, message: listError.message }, { status: 500 });
  }

  const subscriptions = (data || []) as Array<{
    id: string;
    endpoint: string;
    active: boolean;
    created_at: string;
    updated_at: string;
    last_success_at: string | null;
    last_failure_at: string | null;
    failure_reason: string | null;
  }>;

  return NextResponse.json({
    ok: true,
    subscriptions,
    hasActive: subscriptions.some((row) => row.active),
  });
}

export async function POST(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const subscription = parseSubscriptionBody(body);
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) {
    return NextResponse.json(
      { ok: false, message: "Subscription invalida. Endpoint/keys ausentes." },
      { status: 400 },
    );
  }

  const { data, error: upsertError } = await client
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: req.headers.get("user-agent") || null,
        active: true,
        failure_reason: null,
        last_failure_at: null,
      },
      { onConflict: "endpoint" },
    )
    .select("id, endpoint, active")
    .single();

  if (upsertError) {
    if (isMissingSubscriptionsTable(upsertError.message)) {
      return NextResponse.json(
        { ok: false, message: "Tabela subscriptions nao encontrada. Rode o supabase.sql atualizado." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subscription: data,
  });
}

export async function DELETE(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as { endpoint?: string }));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

  let query = client
    .from("subscriptions")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { error: updateError } = await query;

  if (updateError) {
    if (isMissingSubscriptionsTable(updateError.message)) {
      return NextResponse.json(
        { ok: false, message: "Tabela subscriptions nao encontrada. Rode o supabase.sql atualizado." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: endpoint
      ? "Subscription desativada."
      : "Todas as subscriptions do usuario foram desativadas.",
  });
}
