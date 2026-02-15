import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { toNumber } from "@/lib/money";

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

type ModelSuccess = {
  reply: string;
  model: string;
};

type ModelAttemptResult =
  | { ok: true; data: ModelSuccess }
  | { ok: false; status: number; details: string };

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeForMatch = (value: string) =>
  normalizeSpace(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  );

const SYSTEM_PROMPT = `
Voce e o Grana AI, assistente do app Finance Cloud.
Responda sempre em portugues do Brasil.
Pode responder perguntas gerais e perguntas financeiras.
Quando a pergunta for financeira, seja pratico, objetivo e didatico.
Se nao souber um fato especifico, diga claramente que nao tem confirmacao.
Evite respostas longas sem necessidade.
`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);

const formatMonthLabel = (date = new Date()) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);

const isSpendingSummaryQuestion = (text: string) => {
  const normalized = normalizeForMatch(text);
  return (
    (/(como andam|como estao|resumo|situacao)/.test(normalized)
      && /(gasto|despesa|financeiro|financas)/.test(normalized))
    || /(quanto gastei|gastei no mes|meus gastos|despesas do mes)/.test(normalized)
  );
};

const isDatabaseFinanceQuestion = (text: string) => {
  const normalized = normalizeForMatch(text);
  return /(gasto|despesa|receita|saldo|conta|cartao|fatura|limite|investimento|patrimonio|financeiro|financas|quanto tenho|quanto gastei|quanto ganhei|resumo)/.test(
    normalized,
  );
};

const buildLocalFallback = (text: string) => {
  const normalized = normalizeForMatch(text);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (/\b(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalized)) {
    return "Oi. Posso te ajudar com perguntas gerais e tambem com lancamentos financeiros.";
  }

  if (/\b(que dia|data de hoje|hoje)\b/.test(normalized)) {
    return `Hoje e ${dateLabel}.`;
  }

  if (/\bcdb\b/.test(normalized) || /\bcbd\b/.test(normalized)) {
    return "CDB e um investimento de renda fixa emitido por bancos. Voce empresta dinheiro ao banco e recebe rendimento em troca.";
  }

  if (/\b(relacionamento bancario|score bancario|score de credito|credito)\b/.test(normalized)) {
    return [
      "Relacionamento bancario e como o banco avalia seu comportamento financeiro.",
      "Pontos que ajudam: pagar fatura em dia, usar limite com controle (ideal abaixo de 70%), movimentar conta e manter investimentos.",
      "Se quiser, eu te passo um plano pratico para subir score e melhorar credito.",
    ].join(" ");
  }

  if (/\b(cdi|selic|ipca|inflacao|juros compostos)\b/.test(normalized)) {
    return [
      "Resumo rapido:",
      "CDI e taxa de referencia para CDB.",
      "Selic e taxa basica de juros do Banco Central.",
      "IPCA mede inflacao.",
      "Juros compostos = rendimento sobre rendimento.",
    ].join(" ");
  }

  if (/\b(reserva de emergencia|reserva emergencia|reserva)\b/.test(normalized)) {
    return "Reserva de emergencia ideal: 3 a 12 meses de custos fixos em liquidez diaria e baixo risco.";
  }

  if (/\b(diversific|carteira|investimento)\b/.test(normalized)) {
    return "Diversificacao reduz risco. Combine reserva, renda fixa e renda variavel conforme perfil e prazo.";
  }

  if (/\bdeposito\b/.test(normalized) || /\bdepositar\b/.test(normalized)) {
    return "Deposito e entrada de dinheiro na conta. No app, registro de deposito entra como receita.";
  }

  if (/\bpix\b/.test(normalized)) {
    return "PIX e transferencia instantanea. Posso te orientar no lancamento como entrada ou saida.";
  }

  if (/\b(uber|netflix|ifood|mercado|gastei|paguei|ganhei|recebi)\b/.test(normalized)) {
    return "Posso registrar esse texto para voce. Ex: gastei 25 uber e 12 netflix, ou ganhei 500 deposito.";
  }

  return "Posso responder perguntas gerais e financeiras. Se for sobre seus dados, pergunte por exemplo: como andam meus gastos, como esta minha fatura, ou como estao meus investimentos.";
};

const buildMonthlySummaryReply = async (req: NextRequest) => {
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return "Para responder seus gastos do mes, faca login novamente e tente de novo.";
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data, error: txError } = await client
    .from("transactions")
    .select("amount, type, category")
    .eq("user_id", user.id)
    .gte("occurred_at", startDate)
    .lt("occurred_at", endDate)
    .in("type", ["income", "adjustment", "expense", "card_payment"]);

  if (txError) {
    return "Nao consegui carregar seu resumo financeiro agora. Tente novamente em alguns segundos.";
  }

  const rows = (data || []) as Array<{
    amount: number | string | null;
    type: string | null;
    category: string | null;
  }>;

  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();

  rows.forEach((row) => {
    const amount = Math.abs(toNumber(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (row.type === "income" || row.type === "adjustment") {
      income += amount;
      return;
    }

    if (row.type === "expense" || row.type === "card_payment") {
      expense += amount;
      const category = (row.category || "Sem categoria").trim() || "Sem categoria";
      byCategory.set(category, (byCategory.get(category) || 0) + amount);
    }
  });

  const topCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  const balance = income - expense;
  const monthLabel = formatMonthLabel(now);

  const topCategoryLine = topCategory
    ? `Maior categoria: ${topCategory[0]} (${formatCurrency(topCategory[1])}).`
    : "Sem categoria dominante no periodo.";

  return [
    `Resumo de ${monthLabel}:`,
    `- Entradas: ${formatCurrency(income)}`,
    `- Gastos: ${formatCurrency(expense)}`,
    `- Resultado: ${formatCurrency(balance)}`,
    topCategoryLine,
  ].join("\n");
};

const buildDatabaseFinanceReply = async (req: NextRequest, text: string) => {
  const normalized = normalizeForMatch(text);
  const { user, client, error } = await getUserFromRequest(req);
  if (!user || !client || error) {
    return "Para responder com seus dados reais, faca login novamente e tente de novo.";
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const [txRes, cardsRes, invRes] = await Promise.all([
    client
      .from("transactions")
      .select("amount, type, category, card_id")
      .eq("user_id", user.id)
      .gte("occurred_at", startDate)
      .lt("occurred_at", endDate)
      .in("type", ["income", "adjustment", "expense", "card_payment"]),
    client.from("cards").select("id, name, limit_total, archived").eq("user_id", user.id),
    client
      .from("investments")
      .select("asset_name, investment_type, current_amount, invested_amount")
      .eq("user_id", user.id),
  ]);

  if (txRes.error) {
    return "Nao consegui ler seus dados financeiros agora. Tente novamente em alguns segundos.";
  }

  const txRows = (txRes.data || []) as Array<{
    amount: number | string | null;
    type: string | null;
    category: string | null;
    card_id: string | null;
  }>;

  let income = 0;
  let expense = 0;
  const categoryMap = new Map<string, number>();
  const cardSpentMap = new Map<string, number>();

  txRows.forEach((row) => {
    const amount = Math.abs(toNumber(row.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (row.type === "income" || row.type === "adjustment") {
      income += amount;
      return;
    }

    if (row.type === "expense" || row.type === "card_payment") {
      expense += amount;
      const category = (row.category || "Sem categoria").trim() || "Sem categoria";
      categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
      if (row.card_id && row.type !== "card_payment") {
        cardSpentMap.set(row.card_id, (cardSpentMap.get(row.card_id) || 0) + amount);
      }
    }
  });

  const monthLabel = formatMonthLabel(now);
  const topCategory = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];

  if (/(cartao|fatura|limite)/.test(normalized)) {
    if (cardsRes.error) return "Nao consegui carregar seus cartoes agora.";

    const cards = ((cardsRes.data || []) as Array<{
      id: string;
      name: string;
      limit_total: number | string | null;
      archived: boolean;
    }>).filter((card) => !card.archived);

    if (!cards.length) return "Voce ainda nao tem cartoes cadastrados.";

    const lines = cards.slice(0, 5).map((card) => {
      const spent = cardSpentMap.get(card.id) || 0;
      const limit = Math.abs(toNumber(card.limit_total));
      const available = Math.max(limit - spent, 0);
      return `- ${card.name}: gasto no mes ${formatCurrency(spent)} | limite disponivel ${formatCurrency(available)}`;
    });

    return [`Resumo de cartoes (${monthLabel}):`, ...lines].join("\n");
  }

  if (/(investimento|patrimonio|ativos)/.test(normalized)) {
    if (invRes.error) return "Nao consegui carregar seus investimentos agora.";

    const invRows = (invRes.data || []) as Array<{
      asset_name: string | null;
      investment_type: string | null;
      current_amount: number | string | null;
      invested_amount: number | string | null;
    }>;

    if (!invRows.length) return "Voce ainda nao tem investimentos cadastrados.";

    const invested = invRows.reduce((sum, row) => sum + Math.abs(toNumber(row.invested_amount)), 0);
    const current = invRows.reduce((sum, row) => sum + Math.abs(toNumber(row.current_amount)), 0);
    const delta = current - invested;

    const topAssets = [...invRows]
      .sort((a, b) => Math.abs(toNumber(b.current_amount)) - Math.abs(toNumber(a.current_amount)))
      .slice(0, 3)
      .map((row) => `- ${(row.asset_name || row.investment_type || "Ativo").trim()}: ${formatCurrency(Math.abs(toNumber(row.current_amount)))}`);

    return [
      `Resumo de investimentos (${monthLabel}):`,
      `- Valor investido: ${formatCurrency(invested)}`,
      `- Valor atual: ${formatCurrency(current)}`,
      `- Resultado: ${formatCurrency(delta)}`,
      ...topAssets,
    ].join("\n");
  }

  const balance = income - expense;
  return [
    `Resumo financeiro de ${monthLabel}:`,
    `- Entradas: ${formatCurrency(income)}`,
    `- Gastos: ${formatCurrency(expense)}`,
    `- Resultado: ${formatCurrency(balance)}`,
    topCategory
      ? `- Maior categoria: ${topCategory[0]} (${formatCurrency(topCategory[1])})`
      : "- Maior categoria: sem dados",
  ].join("\n");
};

const parseHistory = (rawHistory: unknown): ChatTurn[] => {
  const list = Array.isArray(rawHistory) ? rawHistory : [];
  return list
    .map((item: unknown) => {
      if (!item || typeof item !== "object") return null;
      const maybe = item as Record<string, unknown>;
      const role = maybe.role === "assistant" ? "assistant" : "user";
      const turnText = normalizeSpace(String(maybe.text ?? ""));
      if (!turnText) return null;
      return { role, text: turnText } as ChatTurn;
    })
    .filter((item: ChatTurn | null): item is ChatTurn => !!item)
    .slice(-10);
};

const normalizeModelName = (value: string) => value.replace(/^models\//i, "").trim();

const uniqueModels = (models: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of models) {
    const model = normalizeModelName(item);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    output.push(model);
  }
  return output;
};

const buildGeminiCandidates = () =>
  uniqueModels([
    process.env.GEMINI_MODEL || "",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro-latest",
  ]);

const buildOpenAICandidates = () =>
  uniqueModels([
    process.env.OPENAI_MODEL || "",
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
  ]);

const callGeminiModel = async (
  text: string,
  history: ChatTurn[],
  apiKey: string,
  model: string,
): Promise<ModelAttemptResult> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text }] },
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT.trim() }],
      },
      contents,
      generationConfig: {
        temperature: 0.4,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    return { ok: false, status: response.status, details: details.slice(0, 300) };
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const reply = normalizeSpace(
    Array.isArray(parts)
      ? parts
          .map((part: unknown) => {
            if (!part || typeof part !== "object") return "";
            return String((part as Record<string, unknown>).text ?? "");
          })
          .join(" ")
      : "",
  );

  if (!reply) return { ok: false, status: 502, details: "Gemini sem resposta." };
  return { ok: true, data: { reply, model } };
};

const chatWithGemini = async (text: string, history: ChatTurn[], apiKey: string) => {
  const candidates = buildGeminiCandidates();
  const errors: string[] = [];

  for (const model of candidates) {
    const result = await callGeminiModel(text, history, apiKey, model);
    if (result.ok) return result.data;

    errors.push(`${model} (${result.status})`);
    if (![400, 404].includes(result.status)) {
      throw new Error(`Gemini falhou: ${result.details}`);
    }
  }

  throw new Error(`Gemini nao encontrou modelo compativel. Testados: ${errors.join(", ")}`);
};

const callOpenAIModel = async (
  text: string,
  history: ChatTurn[],
  apiKey: string,
  model: string,
): Promise<ModelAttemptResult> => {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT.trim() },
    ...history.map((item) => ({ role: item.role, content: item.text })),
    { role: "user", content: text },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
  });

  if (!response.ok) {
    const details = await response.text();
    return { ok: false, status: response.status, details: details.slice(0, 300) };
  }

  const data = await response.json();
  const reply = normalizeSpace(String(data?.choices?.[0]?.message?.content ?? ""));
  if (!reply) return { ok: false, status: 502, details: "OpenAI sem resposta." };
  return { ok: true, data: { reply, model } };
};

const chatWithOpenAI = async (text: string, history: ChatTurn[], apiKey: string) => {
  const candidates = buildOpenAICandidates();
  const errors: string[] = [];

  for (const model of candidates) {
    const result = await callOpenAIModel(text, history, apiKey, model);
    if (result.ok) return result.data;

    errors.push(`${model} (${result.status})`);
    if (![400, 404].includes(result.status)) {
      throw new Error(`OpenAI falhou: ${result.details}`);
    }
  }

  throw new Error(`OpenAI nao encontrou modelo compativel. Testados: ${errors.join(", ")}`);
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = normalizeSpace(String(body?.text ?? ""));
  const history = parseHistory(body?.history);

  if (!text) {
    return NextResponse.json({ message: "Informe uma mensagem." }, { status: 400 });
  }

  if (isSpendingSummaryQuestion(text)) {
    const reply = await buildMonthlySummaryReply(req);
    return NextResponse.json({ reply, provider: "financial-summary" });
  }

  if (isDatabaseFinanceQuestion(text)) {
    const reply = await buildDatabaseFinanceReply(req, text);
    return NextResponse.json({ reply, provider: "database-summary" });
  }

  const geminiApiKey =
    process.env.GEMINI_API_KEY
    || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    || process.env.GOOGLE_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!geminiApiKey && !openAiApiKey) {
    return NextResponse.json({
      reply: buildLocalFallback(text),
      provider: "local-no-ai",
    });
  }

  const errors: string[] = [];

  try {
    if (geminiApiKey) {
      try {
        const result = await chatWithGemini(text, history, geminiApiKey);
        return NextResponse.json({
          reply: result.reply,
          provider: "gemini",
          model: result.model,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Erro no Gemini");
      }
    }

    if (openAiApiKey) {
      try {
        const result = await chatWithOpenAI(text, history, openAiApiKey);
        return NextResponse.json({
          reply: result.reply,
          provider: "openai",
          model: result.model,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Erro na OpenAI");
      }
    }

    return NextResponse.json({
      reply: buildLocalFallback(text),
      provider: "local-fallback",
      details: errors.slice(0, 2).join(" | "),
    });
  } catch (error) {
    return NextResponse.json({
      reply: buildLocalFallback(text),
      provider: "local-fallback",
      details: error instanceof Error ? error.message : "Erro inesperado",
    });
  }
}
