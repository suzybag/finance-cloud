import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest, logSecurityEvent } from "@/lib/apiAuth";
import { encryptJson, hasEncryptionKey } from "@/lib/security/encryption";

export async function GET(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const { data, error: readError } = await admin
    .from("investment_security_snapshots")
    .select("updated_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, message: readError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    snapshot: data || null,
  });
}

export async function POST(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }
  if (!hasEncryptionKey()) {
    return NextResponse.json({ ok: false, message: "APP_ENCRYPTION_KEY nao configurada." }, { status: 503 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const { data: investments, error: invError } = await client
    .from("investments")
    .select("*")
    .eq("user_id", user.id);

  if (invError) {
    return NextResponse.json({ ok: false, message: invError.message }, { status: 500 });
  }

  const encryptedPayload = encryptJson({
    generated_at: new Date().toISOString(),
    user_id: user.id,
    investments: investments || [],
  });

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await admin.from("investment_security_snapshots").upsert(
    {
      user_id: user.id,
      payload_enc: encryptedPayload,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  await logSecurityEvent({
    req,
    eventType: "investment_security_snapshot_updated",
    severity: "info",
    message: "Snapshot criptografado de investimentos atualizado.",
    userId: user.id,
    metadata: {
      rows: (investments || []).length,
    },
  });

  return NextResponse.json({
    ok: true,
    total_rows: (investments || []).length,
    updated_at: nowIso,
  });
}
