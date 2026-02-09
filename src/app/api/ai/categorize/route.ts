import { NextRequest, NextResponse } from "next/server";

type CategorizeInput = {
  id: string;
  description?: string;
};

const rules: Record<string, string> = {
  uber: "Transporte",
  gasolina: "Transporte",
  mercado: "Mercado",
  supermercado: "Mercado",
  ifood: "Alimentacao",
  aluguel: "Moradia",
  energia: "Contas",
  agua: "Contas",
  internet: "Contas",
  salario: "Receita",
};

const guessCategory = (text: string) => {
  const lower = text.toLowerCase();
  for (const key of Object.keys(rules)) {
    if (lower.includes(key)) return rules[key];
  }
  return "Outros";
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const transactions: CategorizeInput[] = Array.isArray(body?.transactions)
    ? body.transactions
    : [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const suggestions = transactions.map((tx) => ({
      id: tx.id,
      category: guessCategory(tx.description || ""),
    }));
    return NextResponse.json({ suggestions });
  }

  const prompt = `Sugira categorias curtas em portugues para as transacoes a seguir. Responda em JSON no formato { suggestions: [{ id, category }] }.
Transacoes: ${JSON.stringify(transactions)}`;

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
          { role: "system", content: "Responda apenas com JSON valido." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error("openai_error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    return NextResponse.json(JSON.parse(content));
  } catch {
    const suggestions = transactions.map((tx) => ({
      id: tx.id,
      category: guessCategory(tx.description || ""),
    }));
    return NextResponse.json({ suggestions });
  }
}
