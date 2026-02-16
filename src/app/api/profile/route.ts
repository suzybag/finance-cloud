import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { sanitizeFreeText } from "@/lib/security/input";

const MAX_BODY_SIZE_BYTES = 8 * 1024;

const normalizeDisplayName = (value: string) => value.replace(/\s+/g, " ").trim();
const validateDisplayName = (value: string) => {
  if (!value) return "Nome obrigatorio.";
  if (value.length < 2 || value.length > 40) return "Nome precisa ter entre 2 e 40 caracteres.";
  if (!/\p{L}/u.test(value)) return "Use pelo menos uma letra.";
  if (/[^0-9\p{L}\s.'-]/u.test(value)) return "Use apenas letras, numeros, espacos, ponto, apostrofo ou hifen.";
  return null;
};

export async function GET(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const { data, error: profileError } = await client
    .from("profiles")
    .select("display_name, avatar_url, avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, message: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: user.id,
      email: user.email ?? null,
      display_name: data?.display_name ?? null,
      avatar_url: data?.avatar_url ?? null,
      avatar_path: data?.avatar_path ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload muito grande." }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const rawName = sanitizeFreeText(body?.display_name ?? body?.name ?? "", 40);
  const normalized = normalizeDisplayName(rawName);

  const validationError = validateDisplayName(normalized);
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 });
  }

  const { error: updateError } = await client
    .from("profiles")
    .upsert({ id: user.id, display_name: normalized }, { onConflict: "id" });

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, display_name: normalized });
}
