import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const normalizeDisplayName = (value: string) => value.replace(/\s+/g, " ").trim();
const validateDisplayName = (value: string) => {
  if (!value) return "Nome obrigatorio.";
  if (value.length < 2 || value.length > 40) return "Nome precisa ter entre 2 e 40 caracteres.";
  if (!/\p{L}/u.test(value)) return "Use pelo menos uma letra.";
  if (/[^0-9\p{L}\s.'-]/u.test(value)) return "Use apenas letras, numeros, espacos, ponto, apostrofo ou hifen.";
  return null;
};

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

  const body = await req.json().catch(() => null);
  const rawName = body?.display_name ?? body?.name ?? "";
  const normalized = normalizeDisplayName(String(rawName));

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
