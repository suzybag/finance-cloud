import { NextRequest, NextResponse } from "next/server";

type PixDirection = "in" | "out";

type PixExtractItem = {
  amount: number;
  direction: PixDirection;
  counterparty: string;
  note: string;
};

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeForMatch = (value: string) =>
  normalizeSpace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const toAmount = (raw: string) => {
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const extractAmount = (text: string) => {
  const match = text.match(/(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/i);
  return match ? toAmount(match[1] ?? "") : 0;
};

const IN_HINTS = [
  "recebi",
  "recebido",
  "entrada",
  "entrou",
  "pix recebido",
  "devolucao recebida",
];

const OUT_HINTS = [
  "enviei",
  "enviado",
  "paguei",
  "pagar",
  "pix para",
  "transferi",
  "mandei",
  "saida",
  "saiu",
];

const detectDirection = (text: string): PixDirection => {
  const normalized = normalizeForMatch(text);
  let inScore = 0;
  let outScore = 0;

  if (/\bde\b/.test(normalized) && /\b(recebi|pix recebido|entrou)\b/.test(normalized)) {
    inScore += 2;
  }

  if (/\b(para|pra)\b/.test(normalized)) {
    outScore += 2;
  }

  IN_HINTS.forEach((hint) => {
    if (normalized.includes(hint)) inScore += 1;
  });

  OUT_HINTS.forEach((hint) => {
    if (normalized.includes(hint)) outScore += 1;
  });

  if (inScore === outScore) {
    return normalized.includes("recebi") ? "in" : "out";
  }

  return inScore > outScore ? "in" : "out";
};

const cleanupCounterparty = (value: string) => {
  const cleaned = normalizeSpace(
    value
      .replace(/[0-9]+(?:[.,][0-9]{1,2})?/g, "")
      .replace(/\b(reais?|pix|transferencia|transferencia pix|r\$)\b/gi, "")
      .replace(/[.,;:!?]+/g, " "),
  );

  return cleaned.split(" ").slice(0, 3).join(" ").trim();
};

const extractCounterparty = (rawText: string, direction: PixDirection) => {
  const text = normalizeSpace(rawText);
  const outMatch = text.match(/\b(?:para|pra)\s+([a-zA-ZÀ-ÿ0-9\s.'-]{2,70})/i);
  const inMatch = text.match(/\b(?:de|do|da)\s+([a-zA-ZÀ-ÿ0-9\s.'-]{2,70})/i);

  const match = direction === "out" ? outMatch : inMatch;
  const candidate = cleanupCounterparty(match?.[1] ?? "");
  return candidate || "Nao informado";
};

const extractNote = (rawText: string, counterparty: string) => {
  let note = normalizeSpace(rawText);

  note = note
    .replace(/(?:r\$\s*)?\d{1,6}(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\b(pix|recebi|recebido|enviei|enviado|paguei|transferi|para|pra|de|do|da)\b/gi, " ")
    .replace(new RegExp(counterparty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
    .replace(/[.,;:!?]+/g, " ");

  note = normalizeSpace(note);
  return note.length > 120 ? note.slice(0, 120) : note;
};

const parsePixText = (text: string): { item: PixExtractItem | null; message?: string } => {
  const normalizedText = normalizeSpace(text);
  const normalizedForMatch = normalizeForMatch(normalizedText);

  if (!normalizedForMatch.includes("pix")) {
    return {
      item: null,
      message: "Frase sem PIX. Exemplo: pix 50 para Joao aluguel.",
    };
  }

  const amount = extractAmount(normalizedText);
  if (amount <= 0) {
    return {
      item: null,
      message: "Informe o valor do PIX. Exemplo: pix 50 para Joao.",
    };
  }

  const direction = detectDirection(normalizedText);
  const counterparty = extractCounterparty(normalizedText, direction);
  const note = extractNote(normalizedText, counterparty);

  return {
    item: {
      amount,
      direction,
      counterparty,
      note,
    },
  };
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = normalizeSpace(String(body?.text ?? ""));

  if (!text) {
    return NextResponse.json({ message: "Informe um texto para analisar." }, { status: 400 });
  }

  const result = parsePixText(text);
  if (!result.item) {
    return NextResponse.json(result);
  }

  return NextResponse.json(result);
}

