import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const parseLimit = (raw: string | null) => {
  const parsed = Number(raw || "8");
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(24, Math.max(1, Math.floor(parsed)));
};

const isMissingInsightsTable = (message?: string | null) =>
  /relation .*insights/i.test(message || "");

export async function GET(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const month = (req.nextUrl.searchParams.get("month") || "").trim();

  let query = client
    .from("insights")
    .select("id, period, insight_type, title, body, severity, source, metadata, created_at")
    .eq("user_id", user.id)
    .order("period", { ascending: false })
    .order("created_at", { ascending: false });

  if (month) {
    query = query.eq("period", month);
  }

  const { data, error: listError } = await query.limit(month ? limit : Math.max(limit * 4, 20));

  if (listError) {
    if (isMissingInsightsTable(listError.message)) {
      return NextResponse.json({
        ok: true,
        insights: [],
        period: null,
        warning: "Tabela insights nao encontrada. Rode o supabase.sql atualizado.",
      });
    }
    return NextResponse.json({ ok: false, message: listError.message }, { status: 500 });
  }

  const rows = (data || []) as Array<{
    id: string;
    period: string;
    insight_type: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical" | "success";
    source: "automation" | "ai" | "manual";
    metadata: Record<string, unknown>;
    created_at: string;
  }>;

  const latestPeriod = month || rows[0]?.period || null;
  const filtered = latestPeriod
    ? rows.filter((row) => row.period === latestPeriod).slice(0, limit)
    : [];

  return NextResponse.json({
    ok: true,
    period: latestPeriod,
    insights: filtered,
  });
}
