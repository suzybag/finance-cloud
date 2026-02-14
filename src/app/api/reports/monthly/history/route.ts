import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const parseLimit = (raw: string | null) => {
  const parsed = Number(raw || "12");
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(36, Math.max(1, Math.floor(parsed)));
};

export async function GET(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

  const { data, error: historyError } = await client
    .from("monthly_report_deliveries")
    .select("id, reference_month, recipient_email, total_amount, status, details, sent_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("reference_month", { ascending: false })
    .limit(limit);

  if (historyError) {
    if (/relation .*monthly_report_deliveries/i.test(historyError.message || "")) {
      return NextResponse.json({
        ok: true,
        history: [],
        warning: "Tabela monthly_report_deliveries nao encontrada. Rode o supabase.sql atualizado.",
      });
    }

    return NextResponse.json(
      { ok: false, message: historyError.message || "Falha ao carregar historico." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    history: data || [],
  });
}
