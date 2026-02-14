import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { buildMonthlyReportData } from "@/lib/monthlyReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month");

  try {
    const report = await buildMonthlyReportData({
      client,
      userId: user.id,
      month,
    });

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (reportError) {
    return NextResponse.json(
      {
        ok: false,
        message: reportError instanceof Error ? reportError.message : "Falha ao gerar resumo mensal.",
      },
      { status: 500 },
    );
  }
}
