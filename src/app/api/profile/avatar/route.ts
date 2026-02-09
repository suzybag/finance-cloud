import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const getAuthToken = (req: NextRequest) => {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace("Bearer ", "").trim();
};

const getClientForToken = (token: string) => {
  if (!supabaseUrl) {
    return { client: null, error: "NEXT_PUBLIC_SUPABASE_URL nao configurada." };
  }
  if (!token) {
    return { client: null, error: "Token ausente." };
  }

  const keyToUse = serviceRole || supabaseAnonKey;
  if (!keyToUse) {
    return { client: null, error: "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY nao configurada." };
  }

  const client = createClient(supabaseUrl, keyToUse, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { client, error: null };
};

const getUserFromRequest = async (req: NextRequest) => {
  const token = getAuthToken(req);
  const { client, error } = getClientForToken(token);
  if (!client || error) return { user: null, error, client: null };

  const { data, error: userError } = await client.auth.getUser(token);
  if (userError || !data.user) return { user: null, error: "Token invalido.", client: null };

  return { user: data.user, error: null, client };
};

export async function POST(req: NextRequest) {
  const { user, error, client } = await getUserFromRequest(req);
  if (!user || error || !client) {
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

  const { error: uploadError } = await client
    .storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: file.type });

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
