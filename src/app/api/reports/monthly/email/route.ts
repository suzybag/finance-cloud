import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { sendEmailAlert } from "@/lib/emailAlerts";
import { buildMonthlyReportData, createMonthlyWorkbookBuffer } from "@/lib/monthlyReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isMissingMonthlyHistoryTable = (message?: string | null) =>
  /relation .*monthly_report_deliveries/i.test(message || "");

export async function POST(req: NextRequest) {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return NextResponse.json({ ok: false, message: error || "Nao autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const month = typeof body?.month === "string" ? body.month : undefined;
  const to = (typeof body?.to === "string" ? body.to : user.email || "").trim();

  if (!to || !isValidEmail(to)) {
    return NextResponse.json({ ok: false, message: "Email de destino invalido." }, { status: 400 });
  }

  try {
    const report = await buildMonthlyReportData({
      client,
      userId: user.id,
      month,
    });
    const workbookBuffer = createMonthlyWorkbookBuffer(report);
    const attachmentName = `relatorio-gastos-${report.summary.month}.xlsx`;
    const monthRefDate = `${report.summary.month}-01`;

    const saveDelivery = async (payload: {
      status: "sent" | "error" | "skipped";
      details: string | null;
      sentAt?: string | null;
    }) => {
      const { error: saveError } = await client
        .from("monthly_report_deliveries")
        .upsert(
          {
            user_id: user.id,
            reference_month: monthRefDate,
            recipient_email: to,
            total_amount: report.summary.total,
            status: payload.status,
            details: payload.details,
            sent_at: payload.sentAt ?? null,
          },
          { onConflict: "user_id,reference_month" },
        );

      if (saveError && !isMissingMonthlyHistoryTable(saveError.message)) {
        throw new Error(saveError.message || "Falha ao salvar historico de envio.");
      }
    };

    const topCategory = report.summary.topCategory || "Sem categoria";
    const deltaPercent = report.summary.deltaPercent;
    const deltaText = deltaPercent === null
      ? "Sem base de comparacao"
      : `${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(2).replace(".", ",")}%`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5">
        <h2 style="margin:0 0 12px 0">Relatorio mensal de gastos</h2>
        <p style="margin:0 0 8px 0"><strong>Mes:</strong> ${report.summary.monthLabel}</p>
        <p style="margin:0 0 8px 0"><strong>Total gasto:</strong> ${formatCurrency(report.summary.total)}</p>
        <p style="margin:0 0 8px 0"><strong>Maior categoria:</strong> ${topCategory}</p>
        <p style="margin:0 0 12px 0"><strong>Variacao vs mes anterior:</strong> ${deltaText}</p>
        <p style="margin:0 0 8px 0"><strong>Insights:</strong></p>
        <ul style="margin:0 0 0 20px;padding:0;">
          ${report.summary.insights.map((item) => `<li>${item}</li>`).join("")}
        </ul>
        <p style="margin:16px 0 0 0;color:#475569">A planilha Excel completa segue em anexo.</p>
      </div>
    `;

    const text = [
      `Relatorio mensal de gastos - ${report.summary.monthLabel}`,
      `Total gasto: ${formatCurrency(report.summary.total)}`,
      `Maior categoria: ${topCategory}`,
      `Variacao vs mes anterior: ${deltaText}`,
      "",
      "Insights:",
      ...report.summary.insights.map((item) => `- ${item}`),
    ].join("\n");

    const sendResult = await sendEmailAlert({
      to,
      subject: `Relatorio mensal de gastos - ${report.summary.monthLabel}`,
      html,
      text,
      attachments: [
        {
          filename: attachmentName,
          content: workbookBuffer.toString("base64"),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (!sendResult.ok) {
      await saveDelivery({
        status: "error",
        details: sendResult.error || "Falha ao enviar email.",
        sentAt: null,
      });
      return NextResponse.json(
        { ok: false, message: sendResult.error || "Falha ao enviar email." },
        { status: 502 },
      );
    }

    await saveDelivery({
      status: "sent",
      details: sendResult.provider || null,
      sentAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      to,
      provider: sendResult.provider,
      messageId: sendResult.messageId || null,
      month: report.summary.month,
    });
  } catch (sendError) {
    return NextResponse.json(
      {
        ok: false,
        message: sendError instanceof Error ? sendError.message : "Falha ao gerar e enviar relatorio.",
      },
      { status: 500 },
    );
  }
}
