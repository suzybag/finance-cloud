import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CardRow = {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
};

type TxRow = {
  amount: number;
  type: "income" | "expense" | "transfer" | "adjustment" | "card_payment";
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date: Date, months: number): Date {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function safeSetDay(date: Date, day: number): Date {
  const value = new Date(date.getFullYear(), date.getMonth(), 1);
  const max = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.max(1, Math.min(max, Number(day) || 1)));
  return startOfDay(value);
}

function diffDays(fromDate: Date, toDate: Date): number {
  const ms = startOfDay(toDate).getTime() - startOfDay(fromDate).getTime();
  return Math.round(ms / 86400000);
}

function formatDateBR(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeCycleForBase(card: CardRow, baseDate: Date) {
  const current = startOfDay(baseDate);
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
  const closingThisMonth = safeSetDay(monthStart, card.closing_day);

  const closingDate =
    current <= closingThisMonth
      ? closingThisMonth
      : safeSetDay(addMonths(monthStart, 1), card.closing_day);

  const prevClosing = safeSetDay(addMonths(closingDate, -1), card.closing_day);
  const cycleStart = addDays(prevClosing, 1);
  const cycleEnd = closingDate;

  const dueDate =
    Number(card.due_day) > Number(card.closing_day)
      ? safeSetDay(closingDate, card.due_day)
      : safeSetDay(addMonths(closingDate, 1), card.due_day);

  return { cycleStart, cycleEnd, dueDate };
}

function computeNextCycle(card: CardRow, now = new Date()) {
  for (let i = 0; i < 18; i += 1) {
    const probe = addMonths(now, i);
    const cycle = computeCycleForBase(card, probe);
    const daysLeft = diffDays(now, cycle.dueDate);
    if (daysLeft >= 0) {
      return { ...cycle, daysLeft };
    }
  }
  const fallback = computeCycleForBase(card, now);
  return { ...fallback, daysLeft: diffDays(now, fallback.dueDate) };
}

async function loadInvoiceAmount(
  userId: string,
  cardId: string,
  cycleStart: Date,
  cycleEnd: Date,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .gte("occurred_at", toIsoDate(cycleStart))
    .lte("occurred_at", toIsoDate(cycleEnd))
    .neq("type", "card_payment");

  if (error) throw error;

  return (data as TxRow[] | null | undefined)?.reduce((sum, tx) => {
    const value = Math.abs(Number(tx.amount || 0));
    if (!Number.isFinite(value)) return sum;
    if (tx.type === "income") return sum - value;
    if (tx.type === "transfer") return sum;
    return sum + value;
  }, 0) || 0;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-bot-token");
    if (process.env.NEXT_ALERTS_TOKEN && token !== process.env.NEXT_ALERTS_TOKEN) {
      return NextResponse.json({ ok: false, error: "token invalido" }, { status: 401 });
    }

    const body = await request.json();
    const userId = String(body?.userId || "");
    const alertDays = Math.max(1, Math.min(30, Number(body?.alertDays || 3)));

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId obrigatorio" }, { status: 400 });
    }

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, closing_day, due_day")
      .eq("user_id", userId)
      .eq("archived", false);

    if (cardsError) throw cardsError;

    const now = new Date();
    const alerts = [];
    for (const card of (cards || []) as CardRow[]) {
      const cycle = computeNextCycle(card, now);
      if (cycle.daysLeft !== alertDays) continue;

      const amount = await loadInvoiceAmount(userId, card.id, cycle.cycleStart, cycle.cycleEnd);
      alerts.push({
        cardName: card.name,
        daysLeft: cycle.daysLeft,
        dueDate: formatDateBR(cycle.dueDate),
        amount,
        message:
          `Aviso de Cartao\n` +
          `Seu cartao ${card.name} vence em ${cycle.daysLeft} dias.\n` +
          `Vencimento: ${formatDateBR(cycle.dueDate)}\n` +
          `Valor da fatura: ${formatCurrency(amount)}`,
      });
    }

    return NextResponse.json({ ok: true, alerts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "erro ao gerar alertas", details: String(error) },
      { status: 500 },
    );
  }
}

