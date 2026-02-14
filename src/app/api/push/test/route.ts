import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { hasPushConfig, sendPushToUser } from "@/lib/pushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PushTestBody = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

export async function POST(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  if (!hasPushConfig()) {
    return NextResponse.json(
      { ok: false, message: "VAPID nao configurado. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PushTestBody;
  const title = (body.title || "").trim() || "Finance Cloud";
  const message = (body.body || "").trim() || "Push ativo: suas notificacoes estao funcionando.";
  const url = (body.url || "").trim() || "/dashboard";
  const tag = (body.tag || "").trim() || "push-test";

  const result = await sendPushToUser({
    admin: client,
    userId: user.id,
    payload: {
      title,
      body: message,
      url,
      tag,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message || "Falha no push." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    message: result.message,
  });
}
