import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { buildMonthlyReportData, createMonthlyWorkbookBuffer } from "@/lib/monthlyReports";

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
    const buffer = createMonthlyWorkbookBuffer(report);
    const payload = new Uint8Array(buffer);

    const filename = `relatorio-gastos-${report.summary.month}.xlsx`;
    return new NextResponse(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (reportError) {
    return NextResponse.json(
      {
        ok: false,
        message: reportError instanceof Error ? reportError.message : "Falha ao gerar Excel.",
      },
      { status: 500 },
    );
  }
}
