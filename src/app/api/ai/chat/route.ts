import { NextRequest, NextResponse } from "next/server";

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

type GeminiSuccess = {
  reply: string;
  model: string;
};

type GeminiAttemptResult =
  | { ok: true; data: GeminiSuccess }
  | { ok: false; status: number; details: string };

const normalizeSpace = (value: string) => value.replace(/\s+/g, " ").trim();

const SYSTEM_PROMPT = `
Voce e o Grana AI, assistente do app Finance Cloud.
Responda sempre em portugues do Brasil.
Pode responder perguntas gerais e perguntas financeiras.
Quando a pergunta for financeira, seja pratico, objetivo e didatico.
Se nao souber um fato especifico, diga claramente que nao tem confirmacao.
Evite respostas longas sem necessidade.
`;

const buildLocalFallback = (text: string) => {
  const normalized = normalizeSpace(
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
  );

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

  if (/\bdeposito\b/.test(normalized) || /\bdepositar\b/.test(normalized)) {
    return "Deposito e uma entrada de dinheiro na conta. No app, registro de deposito entra como receita.";
  }

  if (/\bpix\b/.test(normalized)) {
    return "PIX e transferencia instantanea. Se quiser, posso te orientar no lancamento como entrada ou saida.";
  }

  if (/\b(uber|netflix|ifood|mercado|gastei|paguei|ganhei|recebi)\b/.test(normalized)) {
    return "Posso registrar esse texto para voce. Envie no formato: gastei 25 uber e 12 netflix, ou ganhei 500 deposito.";
  }

  return "No momento a IA externa esta indisponivel. Tente novamente em alguns minutos ou envie um lancamento financeiro que eu te ajudo a registrar.";
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

const callGeminiModel = async (
  text: string,
  history: ChatTurn[],
  apiKey: string,
  model: string,
): Promise<GeminiAttemptResult> => {
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
    return {
      ok: false,
      status: response.status,
      details: details.slice(0, 300),
    };
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

  if (!reply) {
    return {
      ok: false,
      status: 502,
      details: "Gemini sem resposta.",
    };
  }

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

  throw new Error(
    `Gemini nao encontrou modelo compativel. Testados: ${errors.join(", ")}`,
  );
};

const chatWithOpenAI = async (text: string, history: ChatTurn[], apiKey: string) => {
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
    const details = await response.text();
    throw new Error(`OpenAI falhou (${response.status}): ${details.slice(0, 300)}`);
  }

  const data = await response.json();
  const reply = normalizeSpace(String(data?.choices?.[0]?.message?.content ?? ""));
  if (!reply) throw new Error("OpenAI sem resposta.");
  return reply;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = normalizeSpace(String(body?.text ?? ""));
  const history = parseHistory(body?.history);

  if (!text) {
    return NextResponse.json({ message: "Informe uma mensagem." }, { status: 400 });
  }

  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!geminiApiKey && !openAiApiKey) {
    return NextResponse.json(
      {
        message:
          "Nenhuma IA configurada. Defina GEMINI_API_KEY (ou OPENAI_API_KEY) no ambiente.",
      },
      { status: 503 },
    );
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
        const reply = await chatWithOpenAI(text, history, openAiApiKey);
        return NextResponse.json({ reply, provider: "openai" });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Erro na OpenAI");
      }
    }

    const fallbackReply = buildLocalFallback(text);
    return NextResponse.json({
      reply: fallbackReply,
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
