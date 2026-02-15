import { NextRequest, NextResponse } from "next/server";

type ParsedItem = {
  description: string;
  amount: number;
  type: "expense" | "income";
  category: string;
};

type ParseResult = {
  items: ParsedItem[];
  summary: { description: string; total: number; type: "expense" | "income" }[];
  totals: { expense: number; income: number; balance: number };
  message?: string;
  out_of_scope?: boolean;
};

const CATEGORY_RULES: Record<string, string> = {
  uber: "Transporte",
  "99": "Transporte",
  gasolina: "Transporte",
  onibus: "Transporte",
  metro: "Transporte",
  ifood: "Alimentacao",
  restaurante: "Alimentacao",
  lanche: "Alimentacao",
  mercado: "Mercado",
  supermercado: "Mercado",
  farmacia: "Saude",
  remedio: "Saude",
  luz: "Contas",
  energia: "Contas",
  agua: "Contas",
  internet: "Contas",
  aluguel: "Moradia",
  condominio: "Moradia",
  netflix: "Assinaturas",
  spotify: "Assinaturas",
  salario: "Salario",
  pagamento: "Salario",
  deposito: "Depositos",
  pix: "Depositos",
  cdb: "Investimentos",
  cbd: "Investimentos",
  poupanca: "Investimentos",
  tesouro: "Investimentos",
  investimento: "Investimentos",
  acoes: "Investimentos",
  acao: "Investimentos",
  fundo: "Investimentos",
  fii: "Investimentos",
};

const INCOME_HINTS = [
  "recebi",
  "ganhei",
  "salario",
  "entrada",
  "deposito",
  "pix recebido",
  "credito",
  "rendimento",
  "rendimentos",
  "juros",
  "dividendo",
  "dividendos",
  "resgate",
  "cashback",
  "cdb",
  "cbd",
];

const EXPENSE_HINTS = [
  "gastei",
  "paguei",
  "pago",
  "comprei",
  "compra",
  "despesa",
  "boleto",
  "conta",
  "debito",
  "cartao",
  "fatura",
  "assinatura",
  "ifood",
  "uber",
  "mercado",
];

const STOPWORDS_START = [
  "hoje",
  "ontem",
  "gastei",
  "paguei",
  "pago",
  "foi",
  "de",
  "da",
  "do",
  "na",
  "no",
  "em",
  "pra",
  "pro",
  "para",
  "com",
  "r$",
  "reais",
  "mais",
];

const FINANCE_SCOPE_HINTS = [
  ...INCOME_HINTS,
  ...EXPENSE_HINTS,
  ...Object.keys(CATEGORY_RULES),
  "pix",
  "deposito",
  "deposito em",
  "investimento",
  "cartao",
  "fatura",
  "conta",
  "transferencia",
  "transferencia pix",
  "consorcio",
];

const TRAILING_CONNECTORS = ["de", "da", "do", "na", "no", "em", "pra", "pro", "para", "com", "e"];
const GENERIC_DESCRIPTIONS = ["mais", "valor", "lancamento", "lancamento rapido"];

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeForMatch = (value: string) =>
  normalizeSpace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const toAmount = (raw: string) => {
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

const toTitle = (value: string) =>
  normalizeSpace(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const cleanupDescription = (raw: string) => {
  let text = normalizeSpace(raw.replace(/[\n\r\t]+/g, " ").replace(/[.,;:!?]+/g, " "));
  while (text) {
    const firstWord = normalizeForMatch(text.split(" ")[0] ?? "");
    if (!firstWord || !STOPWORDS_START.includes(firstWord)) break;
    text = text.slice((text.split(" ")[0] ?? "").length).trim();
  }
  text = text.replace(/^(e\s+)/i, "").trim();
  return normalizeSpace(text);
};

const trimTrailingConnectors = (value: string) => {
  let text = normalizeSpace(value);
  while (text) {
    const words = text.split(" ");
    const last = normalizeForMatch(words[words.length - 1] ?? "");
    if (!last || !TRAILING_CONNECTORS.includes(last)) break;
    words.pop();
    text = words.join(" ").trim();
  }
  return text;
};

const takeFirstWords = (value: string, maxWords = 6) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");

const takeLastWords = (value: string, maxWords = 6) => {
  const parts = value.split(" ").filter(Boolean);
  return parts.slice(Math.max(parts.length - maxWords, 0)).join(" ");
};

const guessCategory = (description: string) => {
  const lower = normalizeForMatch(description);
  for (const key of Object.keys(CATEGORY_RULES)) {
    if (lower.includes(key)) return CATEGORY_RULES[key];
  }
  return "Outros";
};

const countHintMatches = (text: string, hints: string[]) =>
  hints.reduce((score, hint) => (text.includes(hint) ? score + 1 : score), 0);

const hasFinanceIntent = (text: string) => {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  const hasKeyword = FINANCE_SCOPE_HINTS.some((hint) =>
    normalized.includes(normalizeForMatch(hint)),
  );

  if (hasKeyword) return true;

  const amountMatches = Array.from(
    normalized.matchAll(/(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/gi),
  );
  const hasAmount = amountMatches.length > 0;
  const hasCurrency = /\br\$\s*\d/i.test(normalized);
  const hasFinanceVerb =
    /(gastei|paguei|recebi|ganhei|depositei|deposito|pix|investi|aporte|fatura|compra|salario|rendimento)/i.test(
      normalized,
    );

  if (hasAmount && hasFinanceVerb) return true;

  // Aceita frases curtas com valor (ex: "curso 500", "uber 27,90")
  // para nao bloquear lancamentos rapidos sem verbo financeiro explicito.
  if (hasAmount) {
    const words = normalized.split(" ").filter(Boolean);
    const isQuestion =
      normalized.includes("?") ||
      /^(o que|como|qual|quais|porque|por que|onde|quando|quem)\b/.test(normalized);

    const hasTextWord = words.some((word) => /[a-z]/.test(word) && word.length >= 3);

    const hasNonYearAmount = amountMatches.some((item) => {
      const raw = String(item[1] ?? "").replace(/\./g, "").replace(",", ".");
      const value = Number(raw);
      if (!Number.isFinite(value)) return false;
      if (hasCurrency) return true;
      return value < 1900 || value > 2100;
    });

    if (!isQuestion && hasTextWord && hasNonYearAmount && words.length <= 8) {
      return true;
    }
  }

  return false;
};

const emptyResult = (
  opts: { message?: string; outOfScope?: boolean } = {},
): ParseResult => ({
  items: [],
  summary: [],
  totals: { expense: 0, income: 0, balance: 0 },
  message: opts.message,
  out_of_scope: opts.outOfScope,
});

const guessType = (description: string, fullText: string): "expense" | "income" => {
  const lower = normalizeForMatch(`${description} ${fullText}`);
  let incomeScore = countHintMatches(lower, INCOME_HINTS);
  let expenseScore = countHintMatches(lower, EXPENSE_HINTS);

  if (lower.includes("resgate") || lower.includes("rendimento") || lower.includes("dividendo")) {
    incomeScore += 2;
  }

  if ((lower.includes("cdb") || lower.includes("cbd")) && lower.includes("deposito")) {
    incomeScore += 2;
  }

  if (lower.includes("investi") || lower.includes("apliquei") || lower.includes("aporte")) {
    expenseScore += 2;
  }

  if (incomeScore === expenseScore) {
    return incomeScore > 0 ? "income" : "expense";
  }

  return incomeScore > expenseScore ? "income" : "expense";
};

const sanitizeItem = (item: unknown, fullText: string): ParsedItem | null => {
  if (!item || typeof item !== "object") return null;
  const maybe = item as Record<string, unknown>;

  const descriptionRaw = cleanupDescription(String(maybe.description ?? ""));
  const amount = toAmount(String(maybe.amount ?? ""));
  if (amount <= 0) return null;

  const forcedIncomeByText = /(\bcdb\b|\bcbd\b|deposito|dep[oó]sito)/i.test(
    normalizeForMatch(fullText),
  );

  const explicitType = maybe.type === "income" || maybe.type === "expense" ? maybe.type : null;

  const inferredType = descriptionRaw
    ? guessType(descriptionRaw, fullText)
    : forcedIncomeByText
      ? "income"
      : "expense";

  const description = descriptionRaw
    ? toTitle(descriptionRaw)
    : forcedIncomeByText
      ? "Deposito"
      : inferredType === "income"
        ? "Receita"
        : "Lancamento";

  const type = explicitType ?? inferredType;

  const categoryRaw = normalizeSpace(String(maybe.category ?? ""));
  const category = categoryRaw || guessCategory(`${description} ${fullText}`);

  return {
    description,
    amount,
    type,
    category,
  };
};

const buildSummary = (items: ParsedItem[]) => {
  const map = new Map<string, { description: string; total: number; type: "expense" | "income" }>();
  let expense = 0;
  let income = 0;

  for (const item of items) {
    const key = `${item.type}:${normalizeForMatch(item.description)}`;
    const prev = map.get(key);
    if (prev) {
      prev.total += item.amount;
    } else {
      map.set(key, { description: item.description, total: item.amount, type: item.type });
    }

    if (item.type === "income") income += item.amount;
    else expense += item.amount;
  }

  const summary = Array.from(map.values()).sort((a, b) => b.total - a.total);
  return {
    summary,
    totals: {
      expense,
      income,
      balance: income - expense,
    },
  };
};

const parseWithRules = (text: string): ParseResult => {
  const amountRegex = /(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/gi;
  const matches: { amountRaw: string; start: number; end: number }[] = [];

  let match = amountRegex.exec(text);
  while (match) {
    matches.push({
      amountRaw: match[1] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
    match = amountRegex.exec(text);
  }

  const items: ParsedItem[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const nextStart = matches[index + 1]?.start ?? text.length;
    const prevEnd = matches[index - 1]?.end ?? 0;

    const afterFragment = cleanupDescription(text.slice(current.end, nextStart));
    const beforeFragment = trimTrailingConnectors(cleanupDescription(text.slice(prevEnd, current.start)));

    const afterDescription = takeFirstWords(afterFragment, 6);
    const beforeDescription = takeLastWords(beforeFragment, 6);

    const normalizedAfter = normalizeForMatch(afterDescription);
    const normalizedBefore = normalizeForMatch(beforeDescription);

    let description =
      afterDescription && !GENERIC_DESCRIPTIONS.includes(normalizedAfter)
        ? afterDescription
        : beforeDescription;

    if (!description || GENERIC_DESCRIPTIONS.includes(normalizedBefore)) {
      const normText = normalizeForMatch(text);
      if (normText.includes("cdb") || normText.includes("cbd")) {
        description = "CDB";
      }
    }

    const amount = toAmount(current.amountRaw);
    if (amount <= 0) continue;

    const type = guessType(description, text);

    const fallbackDescription = type === "income" ? "Deposito" : "Lancamento";
    const safeDescription = description ? toTitle(description) : fallbackDescription;

    items.push({
      description: safeDescription,
      amount,
      type,
      category: guessCategory(`${safeDescription} ${text}`),
    });
  }

  const { summary, totals } = buildSummary(items);
  return { items, summary, totals };
};

const tryParseJson = (raw: string) => {
  const clean = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(clean);
};

const parseWithOpenAI = async (text: string, apiKey: string): Promise<ParseResult | null> => {
  const prompt = `Extraia lancamentos financeiros da frase abaixo.
Regras:
- Retorne apenas JSON valido no formato: { "items": [{ "description": "...", "amount": 0, "type": "expense|income", "category": "..." }] }.
- Nao invente itens.
- "amount" deve ser numero positivo.
- "description" curta (ex: "Uber", "Netflix", "CDB").
- Entenda sinonimos: deposito/depósito/recebi/ganhei = income.
- Entenda investimentos: CDB/CBD/poupanca/tesouro = categoria "Investimentos".
- Se a frase nao for sobre lancamento financeiro, retorne { "items": [], "out_of_scope": true, "message": "Eu so respondo lancamentos financeiros." }.
- Se nao conseguir extrair, retorne { "items": [] }.
Frase: ${text}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responda somente JSON valido." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;

  const parsed = tryParseJson(content);
  if (parsed?.out_of_scope) {
    const message =
      typeof parsed?.message === "string" && normalizeSpace(parsed.message)
        ? normalizeSpace(parsed.message)
        : "Eu foco apenas em lancamentos financeiros. Ex: gastei 25 uber e 12 netflix.";
    return emptyResult({ message, outOfScope: true });
  }

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = rawItems
    .map((item: unknown) => sanitizeItem(item, text))
    .filter((item: ParsedItem | null): item is ParsedItem => !!item);

  const { summary, totals } = buildSummary(items);
  return { items, summary, totals };
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = normalizeSpace(String(body?.text ?? ""));
  if (!text) {
    return NextResponse.json({ message: "Informe um texto para analisar." }, { status: 400 });
  }

  if (!hasFinanceIntent(text)) {
    return NextResponse.json(
      emptyResult({
        outOfScope: true,
        message:
          "Eu foco apenas em lancamentos financeiros. Ex: gastei 25 uber e 12 netflix, ganhei 500 deposito.",
      }),
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const aiResult = await parseWithOpenAI(text, apiKey);
      if (aiResult) return NextResponse.json(aiResult);
    } catch {
      // fallback local parser
    }
  }

  return NextResponse.json(parseWithRules(text));
}
