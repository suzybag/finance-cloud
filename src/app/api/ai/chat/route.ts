import { NextRequest, NextResponse } from "next/server";

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const SYSTEM_PROMPT = `
Voce e o Grana AI, assistente do app Finance Cloud.
Responda sempre em portugues do Brasil.
Pode responder perguntas gerais e perguntas financeiras.
Quando a pergunta for financeira, seja pratico, objetivo e didatico.
Se nao souber um fato especifico, diga claramente que nao tem confirmacao.
Evite respostas longas sem necessidade.
`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = normalizeSpace(String(body?.text ?? ""));
  const rawHistory = Array.isArray(body?.history) ? body.history : [];

  if (!text) {
    return NextResponse.json({ message: "Informe uma mensagem." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        message:
          "ChatGPT ainda nao esta configurado. Defina OPENAI_API_KEY no ambiente.",
      },
      { status: 503 },
    );
  }

  const history: ChatTurn[] = rawHistory
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

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT.trim() },
      ...history.map((item) => ({
        role: item.role,
        content: item.text,
      })),
      { role: "user", content: text },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          message: `Falha ao chamar ChatGPT (${response.status}).`,
          details: errorText.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const data = await response.json();
    const reply = normalizeSpace(String(data?.choices?.[0]?.message?.content ?? ""));

    if (!reply) {
      return NextResponse.json({ message: "Sem resposta do ChatGPT." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Erro ao processar chat.",
        details: error instanceof Error ? error.message : "Erro inesperado",
      },
      { status: 500 },
    );
  }
}

