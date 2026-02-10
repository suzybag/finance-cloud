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
};

const INCOME_HINTS = [
  "recebi",
  "ganhei",
  "salario",
  "entrada",
  "deposito",
  "pix recebido",
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
];

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

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
    const firstWord = text.split(" ")[0]?.toLowerCase();
    if (!firstWord || !STOPWORDS_START.includes(firstWord)) break;
    text = text.slice(firstWord.length).trim();
  }
  text = text.replace(/^(e\s+)/i, "").trim();
  return text;
};

const guessCategory = (description: string) => {
  const lower = description.toLowerCase();
  for (const key of Object.keys(CATEGORY_RULES)) {
    if (lower.includes(key)) return CATEGORY_RULES[key];
  }
  return "Outros";
};

const guessType = (description: string, fullText: string): "expense" | "income" => {
  const lower = `${description} ${fullText}`.toLowerCase();
  return INCOME_HINTS.some((hint) => lower.includes(hint)) ? "income" : "expense";
};

const sanitizeItem = (item: unknown, fullText: string): ParsedItem | null => {
  if (!item || typeof item !== "object") return null;
  const maybe = item as Record<string, unknown>;
  const description = cleanupDescription(String(maybe.description ?? ""));
  const amount = toAmount(String(maybe.amount ?? ""));
  if (!description || amount <= 0) return null;

  const type = maybe.type === "income" ? "income" : guessType(description, fullText);
  const categoryRaw = normalizeSpace(String(maybe.category ?? ""));
  const category = categoryRaw || guessCategory(description);

  return {
    description: toTitle(description),
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
    const key = `${item.type}:${item.description.toLowerCase()}`;
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
  const pairRegex =
    /(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:reais?)?\s*(?:de|da|do|na|no|em|pra|pro|para|com)?\s*([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s.'-]{1,60}?)(?=(?:\s+(?:r\$\s*)?\d{1,6}(?:[.,]\d{1,2})?\b)|$)/gi;

  const items: ParsedItem[] = [];
  let match: RegExpExecArray | null = pairRegex.exec(text);
  while (match) {
    const amount = toAmount(match[1] ?? "");
    const rawDescription = cleanupDescription(match[2] ?? "");
    if (amount > 0 && rawDescription) {
      const description = toTitle(rawDescription);
      items.push({
        description,
        amount,
        type: guessType(description, text),
        category: guessCategory(description),
      });
    }
    match = pairRegex.exec(text);
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
- "description" curta (ex: "Uber", "Netflix").
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
