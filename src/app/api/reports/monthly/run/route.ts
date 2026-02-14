import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isCronAuthorized } from "@/lib/apiAuth";
import { sendEmailAlert } from "@/lib/emailAlerts";
import {
  buildMonthlyReportData,
  createMonthlyWorkbookBuffer,
  getMonthRanges,
  getPreviousMonthKey,
} from "@/lib/monthlyReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);

const getTargetMonth = () => getPreviousMonthKey(new Date());

const listUsersWithMonthSpend = async ({
  monthStart,
  monthEndExclusive,
}: {
  monthStart: string;
  monthEndExclusive: string;
}) => {
  const admin = getAdminClient();
  if (!admin) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

  const [txRes, invRes] = await Promise.all([
    admin
      .from("transactions")
      .select("user_id")
      .gte("occurred_at", monthStart)
      .lt("occurred_at", monthEndExclusive)
      .in("type", ["expense", "card_payment"]),
    admin
      .from("investments")
      .select("user_id")
      .gte("start_date", monthStart)
      .lt("start_date", monthEndExclusive)
      .eq("operation", "compra"),
  ]);

  if (txRes.error) throw new Error(txRes.error.message);

  const userIds = new Set<string>();
  ((txRes.data || []) as Array<{ user_id: string }>).forEach((row) => {
    if (row.user_id) userIds.add(row.user_id);
  });

  if (!invRes.error) {
    ((invRes.data || []) as Array<{ user_id: string }>).forEach((row) => {
      if (row.user_id) userIds.add(row.user_id);
    });
  }

  return Array.from(userIds);
};

async function runMonthlyReports(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const targetMonth = getTargetMonth();
  const ranges = getMonthRanges(targetMonth);
  const monthRefDate = ranges.startDate;

  let userIds: string[] = [];
  try {
    userIds = await listUsersWithMonthSpend({
      monthStart: ranges.startDate,
      monthEndExclusive: ranges.endDateExclusive,
    });
  } catch (baseError) {
    return NextResponse.json(
      {
        ok: false,
        message: baseError instanceof Error ? baseError.message : "Falha ao buscar usuarios do mes.",
      },
      { status: 500 },
    );
  }

  if (!userIds.length) {
    return NextResponse.json({
      ok: true,
      month: targetMonth,
      checked: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      message: "Nenhum usuario com gastos no periodo.",
    });
  }

  let checked = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    checked += 1;

    const existingDelivery = await admin
      .from("monthly_report_deliveries")
      .select("id, status")
      .eq("user_id", userId)
      .eq("reference_month", monthRefDate)
      .maybeSingle();

    if (!existingDelivery.error && existingDelivery.data?.status === "sent") {
      skipped += 1;
      continue;
    }

    const userRes = await admin.auth.admin.getUserById(userId);
    const userEmail = userRes.data.user?.email || "";
    if (!userEmail) {
      skipped += 1;
      await admin.from("monthly_report_deliveries").upsert(
        {
          user_id: userId,
          reference_month: monthRefDate,
          recipient_email: null,
          total_amount: 0,
          status: "skipped",
          details: "Usuario sem email.",
          sent_at: null,
        },
        { onConflict: "user_id,reference_month" },
      );
      continue;
    }

    try {
      const report = await buildMonthlyReportData({
        client: admin,
        userId,
        month: targetMonth,
      });

      const workbookBuffer = createMonthlyWorkbookBuffer(report);
      const attachmentName = `relatorio-gastos-${report.summary.month}.xlsx`;
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
        to: userEmail,
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
        failed += 1;
        const reason = sendResult.error || "Falha ao enviar email.";
        errors.push(`[${userId}] ${reason}`);
        await admin.from("monthly_report_deliveries").upsert(
          {
            user_id: userId,
            reference_month: monthRefDate,
            recipient_email: userEmail,
            total_amount: report.summary.total,
            status: "error",
            details: reason,
            sent_at: null,
          },
          { onConflict: "user_id,reference_month" },
        );
        continue;
      }

      sent += 1;
      await admin.from("monthly_report_deliveries").upsert(
        {
          user_id: userId,
          reference_month: monthRefDate,
          recipient_email: userEmail,
          total_amount: report.summary.total,
          status: "sent",
          details: sendResult.provider,
          sent_at: new Date().toISOString(),
        },
        { onConflict: "user_id,reference_month" },
      );
    } catch (userError) {
      failed += 1;
      const reason = userError instanceof Error ? userError.message : "Erro ao gerar relatorio do usuario.";
      errors.push(`[${userId}] ${reason}`);
      await admin.from("monthly_report_deliveries").upsert(
        {
          user_id: userId,
          reference_month: monthRefDate,
          recipient_email: userEmail,
          total_amount: 0,
          status: "error",
          details: reason,
          sent_at: null,
        },
        { onConflict: "user_id,reference_month" },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    month: targetMonth,
    checked,
    sent,
    skipped,
    failed,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return runMonthlyReports(req);
}

export async function POST(req: NextRequest) {
  return runMonthlyReports(req);
}
