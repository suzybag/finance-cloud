import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_FORM_SIZE_BYTES = (MAX_SIZE_BYTES + 256 * 1024);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const getSafeExtension = (mimeType: string) => {
  const maybeExt = mimeType.split("/")[1]?.toLowerCase() || "jpg";
  return /^[a-z0-9]+$/.test(maybeExt) ? maybeExt : "jpg";
};

export async function POST(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_FORM_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Arquivo muito grande." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Arquivo invalido." }, { status: 400 });
  }

  const mimeType = String(file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ ok: false, message: "Formato invalido. Use JPG, PNG ou WebP." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Arquivo acima de 2MB." }, { status: 400 });
  }

  const extension = getSafeExtension(mimeType);
  const path = `${user.id}/avatar.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await client
    .storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: mimeType });

  if (uploadError) {
    return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });
  }

  const { data: publicData } = client.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?t=${Date.now()}`;

  await client
    .from("profiles")
    .upsert({ id: user.id, avatar_url: avatarUrl, avatar_path: path }, { onConflict: "id" });

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

export async function DELETE(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const { data: profile } = await client
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.avatar_path) {
    await client.storage.from("avatars").remove([profile.avatar_path]);
  }

  await client
    .from("profiles")
    .update({ avatar_url: null, avatar_path: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
