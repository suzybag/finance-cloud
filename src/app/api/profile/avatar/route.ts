import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin =
  supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const getUserFromRequest = async (req: NextRequest) => {
  if (!supabaseAdmin) return { user: null, error: "SUPABASE_SERVICE_ROLE_KEY nao configurada." };
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { user: null, error: "Token ausente." };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { user: null, error: "Token invalido." };

  return { user: data.user, error: null };
};

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, message: "Configure SUPABASE_SERVICE_ROLE_KEY no ambiente." },
      { status: 500 },
    );
  }

  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Arquivo invalido." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, message: "Formato invalido. Use JPG, PNG ou WebP." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, message: "Arquivo acima de 2MB." }, { status: 400 });
  }

  const extension = file.type.split("/")[1] || "jpg";
  const path = `${user.id}/avatar.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ ok: false, message: uploadError.message }, { status: 500 });
  }

  const { data: publicData } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?t=${Date.now()}`;

  await supabaseAdmin
    .from("profiles")
    .upsert({ id: user.id, avatar_url: avatarUrl, avatar_path: path }, { onConflict: "id" });

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

export async function DELETE(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, message: "Configure SUPABASE_SERVICE_ROLE_KEY no ambiente." },
      { status: 500 },
    );
  }

  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.avatar_path) {
    await supabaseAdmin.storage.from("avatars").remove([profile.avatar_path]);
  }

  await supabaseAdmin
    .from("profiles")
    .update({ avatar_url: null, avatar_path: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
