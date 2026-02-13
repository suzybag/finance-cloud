import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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
  if (!client || error) return { user: null, error };

  const { data, error: userError } = await client.auth.getUser(token);
  if (userError || !data.user) return { user: null, error: "Token invalido." };

  return { user: data.user, error: null };
};

export async function DELETE(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { ok: false, message: "Exclusao de conta indisponivel: service role nao configurada." },
      { status: 503 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ ok: false, message: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
