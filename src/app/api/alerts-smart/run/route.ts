import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays } from "date-fns";
import { computeCardSummary, type Card, type Transaction } from "@/lib/finance";
import { toNumber } from "@/lib/money";
import { sendEmailAlert } from "@/lib/emailAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlertRule = {
  id: string;
  user_id: string;
  user_email: string;
  tipo_alerta: "cartao" | "investimento" | "dolar";
  ativo: string | null;
  valor_alvo: number | null;
  percentual: number | null;
  status:
    | "vence_3_dias"
    | "queda_percentual"
    | "queda_valor"
    | "negativo_dia"
    | "acima"
    | "abaixo"
    | null;
  last_triggered_at: string | null;
  ativo_boolean: boolean;
};

type InvestmentRow = {
  id: string;
  user_id: string;
  asset_name: string | null;
  investment_type: string | null;
  current_price: number | null;
  average_price: number | null;
  quantity: number | null;
  current_amount: number | null;
  price_history: number[] | null;
  updated_at: string | null;
};

type DollarResponse = {
  USDBRL?: {
    bid?: string;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const COOLDOWN_MS = 60 * 60 * 1000;

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const normalizeText = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const parseNumber = (value: unknown) => {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateKeySaoPaulo = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(date);

const toIsoTimestamp = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const isAuthorized = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.trim() === `Bearer ${secret}`;
};

const getAdminClient = () => {
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
};

const canTrigger = (rule: AlertRule, now: Date) => {
  const lastIso = toIsoTimestamp(rule.last_triggered_at);
  if (!lastIso) return true;

  const last = new Date(lastIso);
  const diff = now.getTime() - last.getTime();
  if (diff < COOLDOWN_MS) return false;

  if (rule.tipo_alerta === "cartao") {
    return dateKeySaoPaulo(last) !== dateKeySaoPaulo(now);
  }

  return true;
};

const shouldMatchAtivo = (ruleAtivo: string | null, candidates: Array<string | null | undefined>) => {
  const key = normalizeText(ruleAtivo);
  if (!key || key === "*" || key === "all" || key === "todos") return true;
  return candidates.some((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized === key || normalized.includes(key) || key.includes(normalized);
  });
};

const fetchDollarBid = async () => {
  const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`AwesomeAPI USD-BRL falhou (${response.status}).`);
  const data = (await response.json()) as DollarResponse;
  return parseNumber(data.USDBRL?.bid);
};

const buildEmailHtml = ({
  title,
  message,
  ruleDescription,
  now,
}: {
  title: string;
  message: string;
  ruleDescription: string;
  now: Date;
}) => {
  const timestamp = now.toLocaleString("pt-BR");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;">
    <h2 style="margin:0 0 12px 0;color:#111827;">${title}</h2>
    <p style="margin:0 0 10px 0;">${message}</p>
    <p style="margin:0 0 6px 0;"><strong>Regra:</strong> ${ruleDescription}</p>
    <p style="margin:0;color:#475569;"><strong>Horario:</strong> ${timestamp}</p>
  </div>
  `;
};

const buildEmailText = ({
  title,
  message,
  ruleDescription,
  now,
}: {
  title: string;
  message: string;
  ruleDescription: string;
  now: Date;
}) =>
  `${title}\n${message}\nRegra: ${ruleDescription}\nHorario: ${now.toLocaleString("pt-BR")}`;

const updateLastTriggered = async (admin: SupabaseClient, ruleId: string) => {
  await admin
    .from("email_alert_rules")
    .update({ last_triggered_at: new Date().toISOString() })
    .eq("id", ruleId);
};

const getInvestmentMetrics = (row: InvestmentRow) => {
  const quantity = Math.max(0, parseNumber(row.quantity));
  const currentPrice = parseNumber(row.current_price);
  const averagePrice = parseNumber(row.average_price);
  const history = Array.isArray(row.price_history) ? row.price_history : [];
  const prevFromHistory = parseNumber(history[history.length - 2]);
  const fallbackCurrent = quantity > 0 ? parseNumber(row.current_amount) / quantity : 0;
  const current = currentPrice > 0 ? currentPrice : fallbackCurrent;
  const previous = prevFromHistory > 0 ? prevFromHistory : averagePrice > 0 ? averagePrice : current;
  const pct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const valueDelta = (current - previous) * quantity;
  const lossAbs = Math.abs(Math.min(0, valueDelta));

  return {
    current,
    previous,
    pct,
    valueDelta,
    lossAbs,
  };
};

async function runSmartAlerts(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const [rulesRes] = await Promise.all([
    admin
      .from("email_alert_rules")
      .select(
        "id, user_id, user_email, tipo_alerta, ativo, valor_alvo, percentual, status, last_triggered_at, ativo_boolean",
      )
      .eq("ativo_boolean", true),
  ]);

  if (rulesRes.error) {
    return NextResponse.json({ ok: false, message: rulesRes.error.message }, { status: 500 });
  }

  const rules = ((rulesRes.data || []) as AlertRule[])
    .filter((rule) => !!rule.user_email && !!rule.tipo_alerta);

  if (!rules.length) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      triggered: 0,
      sent: 0,
      skipped: 0,
      errors: [],
    });
  }

  const byUser = new Map<string, AlertRule[]>();
  rules.forEach((rule) => {
    if (!byUser.has(rule.user_id)) byUser.set(rule.user_id, []);
    byUser.get(rule.user_id)?.push(rule);
  });

  const now = new Date();
  const errors: string[] = [];
  let checked = 0;
  let triggered = 0;
  let sent = 0;
  let skipped = 0;

  let dollarBid = 0;
  const hasDollarRules = rules.some((rule) => rule.tipo_alerta === "dolar");
  if (hasDollarRules) {
    try {
      dollarBid = await fetchDollarBid();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Falha ao buscar dolar.");
    }
  }

  for (const [userId, userRules] of byUser.entries()) {
    const hasCardRules = userRules.some((rule) => rule.tipo_alerta === "cartao");
    const hasInvestmentRules = userRules.some((rule) => rule.tipo_alerta === "investimento");

    let cards: Card[] = [];
    let transactions: Transaction[] = [];
    let investments: InvestmentRow[] = [];

    if (hasCardRules) {
      const [cardsRes, txRes] = await Promise.all([
        admin
          .from("cards")
          .select("id, name, issuer, limit_total, closing_day, due_day, archived, created_at")
          .eq("user_id", userId),
        admin
          .from("transactions")
          .select("id, occurred_at, type, transaction_type, description, category, amount, account_id, to_account_id, card_id, tags, note")
          .eq("user_id", userId)
          .order("occurred_at", { ascending: false })
          .limit(2500),
      ]);

      if (cardsRes.error || txRes.error) {
        errors.push(cardsRes.error?.message || txRes.error?.message || "Falha ao carregar cartoes/transacoes.");
      } else {
        cards = (cardsRes.data || []) as Card[];
        transactions = (txRes.data || []) as Transaction[];
      }
    }

    if (hasInvestmentRules) {
      const investmentsRes = await admin
        .from("investments")
        .select(
          "id, user_id, asset_name, investment_type, current_price, average_price, quantity, current_amount, price_history, updated_at",
        )
        .eq("user_id", userId);

      if (investmentsRes.error) {
        errors.push(investmentsRes.error.message);
      } else {
        investments = (investmentsRes.data || []) as InvestmentRow[];
      }
    }

    for (const rule of userRules) {
      checked += 1;
      if (!canTrigger(rule, now)) {
        skipped += 1;
        continue;
      }

      if (rule.tipo_alerta === "cartao") {
        const candidates = cards
          .filter((card) => !card.archived)
          .filter((card) => shouldMatchAtivo(rule.ativo, [card.name, card.issuer]));

        let matched = false;
        for (const card of candidates) {
          const summary = computeCardSummary(card, transactions, now);
          const dueInDays = differenceInCalendarDays(summary.dueDate, now);
          const isOpen = summary.currentTotal > 0.009;
          if (dueInDays !== 3 || !isOpen) continue;

          matched = true;
          triggered += 1;

          const title = `⚠️ Seu cartão ${card.name} vence em 3 dias`;
          const message = `Valor atual da fatura aberta: ${brl(summary.currentTotal)}. Vencimento: ${summary.dueDate.toLocaleDateString("pt-BR")}.`;
          const ruleDescription = "Cartão com fatura aberta e vencimento em 3 dias.";

          const send = await sendEmailAlert({
            to: rule.user_email,
            subject: title,
            html: buildEmailHtml({ title, message, ruleDescription, now }),
            text: buildEmailText({ title, message, ruleDescription, now }),
          });

          if (!send.ok) {
            errors.push(send.error || `Falha ao enviar regra ${rule.id}.`);
            continue;
          }

          sent += 1;
          await updateLastTriggered(admin, rule.id);
          break;
        }

        if (!matched) skipped += 1;
        continue;
      }

      if (rule.tipo_alerta === "investimento") {
        const status = rule.status || "queda_percentual";
        const thresholdPct = Math.abs(parseNumber(rule.percentual) || 2);
        const thresholdValue = Math.abs(parseNumber(rule.valor_alvo));

        const candidates = investments
          .filter((inv) => (parseNumber(inv.quantity) > 0 || parseNumber(inv.current_amount) > 0))
          .filter((inv) => shouldMatchAtivo(rule.ativo, [inv.asset_name, inv.investment_type]));

        const triggeredRows = candidates
          .map((inv) => ({ inv, metrics: getInvestmentMetrics(inv) }))
          .filter(({ metrics }) => {
            if (status === "queda_percentual") return metrics.pct <= -thresholdPct;
            if (status === "queda_valor") return thresholdValue > 0 && metrics.lossAbs >= thresholdValue;
            if (status === "negativo_dia") return metrics.pct < 0;
            return false;
          })
          .sort((a, b) => a.metrics.pct - b.metrics.pct);

        const first = triggeredRows[0];
        if (!first) {
          skipped += 1;
          continue;
        }

        triggered += 1;
        const assetLabel = first.inv.asset_name || first.inv.investment_type || "Investimento";
        const pctText = `${Math.abs(first.metrics.pct).toFixed(2).replace(".", ",")}%`;
        const valueText = brl(first.metrics.lossAbs);

        const title = `📉 Seu investimento ${assetLabel} caiu hoje`;
        const message =
          status === "queda_valor"
            ? `${assetLabel} teve queda de ${valueText} no dia (${pctText}).`
            : `${assetLabel} caiu ${pctText} hoje (${valueText} de variacao negativa).`;
        const ruleDescription =
          status === "queda_percentual"
            ? `Queda diaria maior que ${thresholdPct.toFixed(2).replace(".", ",")}%`
            : status === "queda_valor"
              ? `Prejuizo diario maior que ${brl(thresholdValue)}`
              : "Desempenho diario negativo";

        const send = await sendEmailAlert({
          to: rule.user_email,
          subject: title,
          html: buildEmailHtml({ title, message, ruleDescription, now }),
          text: buildEmailText({ title, message, ruleDescription, now }),
        });

        if (!send.ok) {
          errors.push(send.error || `Falha ao enviar regra ${rule.id}.`);
          continue;
        }

        sent += 1;
        await updateLastTriggered(admin, rule.id);
        continue;
      }

      if (rule.tipo_alerta === "dolar") {
        if (dollarBid <= 0) {
          skipped += 1;
          continue;
        }

        const target = parseNumber(rule.valor_alvo);
        if (target <= 0) {
          skipped += 1;
          continue;
        }

        const direction = rule.status || "acima";
        const shouldAlert =
          direction === "acima"
            ? dollarBid >= target
            : direction === "abaixo"
              ? dollarBid <= target
              : false;

        if (!shouldAlert) {
          skipped += 1;
          continue;
        }

        triggered += 1;
        const title = `💵 Dólar atingiu ${brl(dollarBid)}`;
        const message = `USD/BRL atual: ${brl(dollarBid)}. Limite configurado: ${brl(target)} (${direction}).`;
        const ruleDescription =
          direction === "acima"
            ? `Alerta quando dolar sobe acima de ${brl(target)}`
            : `Alerta quando dolar cai abaixo de ${brl(target)}`;

        const send = await sendEmailAlert({
          to: rule.user_email,
          subject: title,
          html: buildEmailHtml({ title, message, ruleDescription, now }),
          text: buildEmailText({ title, message, ruleDescription, now }),
        });

        if (!send.ok) {
          errors.push(send.error || `Falha ao enviar regra ${rule.id}.`);
          continue;
        }

        sent += 1;
        await updateLastTriggered(admin, rule.id);
        continue;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    triggered,
    sent,
    skipped,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return runSmartAlerts(req);
}

export async function POST(req: NextRequest) {
  return runSmartAlerts(req);
}
