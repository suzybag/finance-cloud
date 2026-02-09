import { NextRequest, NextResponse } from "next/server";

type InsightSummary = {
  income?: number;
  expense?: number;
  categories?: { name?: string; value?: number }[];
};

const buildFallback = (summary?: InsightSummary) => {
  if (!summary) return "Sem dados suficientes para gerar insight.";
  const top = summary.categories?.[0];
  const income = summary.income ?? 0;
  const expense = summary.expense ?? 0;
  const balance = income - expense;
  return `Resumo rapido: receitas ${income} e despesas ${expense}. Resultado ${balance}. Top categoria: ${top?.name ?? "-"}.`;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { month, question, summary } = body || {};

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ answer: buildFallback(summary) });
  }

  const prompt = `Voce e um assistente financeiro. Gere insights em portugues.
Mes: ${month}
Resumo: ${JSON.stringify(summary)}
Pergunta: ${question || "Gere insights objetivos."}
Responda em ate 5 frases, com tom direto e pratico.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Voce responde apenas com texto simples." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ answer: buildFallback(summary) }, { status: 200 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    return NextResponse.json({ answer: answer || buildFallback(summary) });
  } catch {
    return NextResponse.json({ answer: buildFallback(summary) }, { status: 200 });
  }
}
