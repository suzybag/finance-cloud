import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

function mask(value) {
  const raw = String(value || "");
  if (!raw) return "(vazio)";
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function looksPlaceholder(value) {
  return /SEU_|YOUR_|SUA_|COLE_|PLACEHOLDER|EXEMPLO/i.test(String(value || ""));
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

  if (!url || !key || looksPlaceholder(url) || looksPlaceholder(key)) {
    return {
      ok: false,
      detail: "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY com valores reais.",
    };
  }

  if (key.startsWith("sb_publishable_")) {
    return {
      ok: false,
      detail:
        "Voce usou chave publishable (sb_publishable_). Para o bot use Service Role (legacy JWT) ou sb_secret_.",
    };
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: healthError } = await supabase.from("cards").select("id").limit(1);
    if (healthError) {
      return { ok: false, detail: `Erro Supabase: ${healthError.message}` };
    }

    const { data: users, error: adminError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (adminError) {
      return {
        ok: false,
        detail: `Chave sem permissao admin (nao e service role/secret): ${adminError.message}`,
      };
    }
    if (!users) {
      return { ok: false, detail: "Supabase admin check falhou sem retorno." };
    }

    return { ok: true, detail: "Conexao Supabase OK com permissao admin." };
  } catch (error) {
    return { ok: false, detail: `Erro Supabase: ${error.message || String(error)}` };
  }
}

async function checkOpenAI() {
  const key = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!key || looksPlaceholder(key)) {
    return { ok: false, detail: "OPENAI_API_KEY nao configurada." };
  }
  try {
    const client = new OpenAI({ apiKey: key });
    await client.chat.completions.create({
      model,
      max_tokens: 5,
      messages: [{ role: "user", content: "responda apenas ok" }],
    });
    return { ok: true, detail: `OpenAI OK (${model}).` };
  } catch (error) {
    return {
      ok: false,
      detail: `Erro OpenAI: ${error.status || ""} ${error.code || ""} ${error.message || String(error)}`.trim(),
    };
  }
}

async function checkGemini() {
  const key =
    process.env.GEMINI_API_KEY || process.env.GEMINIT_API_KEY || process.env.GOOGLE_API_KEY || "";
  const model = (process.env.GEMINI_MODEL || "gemini-2.0-flash")
    .replace(/[`'"\s]+$/g, "")
    .replace(/^models\//, "")
    .trim();

  if (!key || looksPlaceholder(key)) {
    return { ok: false, detail: "GEMINI_API_KEY nao configurada." };
  }

  try {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
      `?key=${key}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "responda apenas ok" }] }],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, detail: `Erro Gemini: ${response.status} ${body.slice(0, 140)}` };
    }

    return { ok: true, detail: `Gemini OK (${model}).` };
  } catch (error) {
    return { ok: false, detail: `Erro Gemini: ${error.message || String(error)}` };
  }
}

async function run() {
  console.log("=== zap-alerta doctor ===");
  console.log(`SUPABASE_URL: ${mask(process.env.SUPABASE_URL)}`);
  console.log(
    `SUPABASE_SERVICE_ROLE_KEY: ${mask(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)}`,
  );
  console.log(`OPENAI_API_KEY: ${mask(process.env.OPENAI_API_KEY)}`);
  console.log(
    `GEMINI_API_KEY: ${mask(process.env.GEMINI_API_KEY || process.env.GEMINIT_API_KEY || process.env.GOOGLE_API_KEY)}`,
  );
  console.log("");

  const supabase = await checkSupabase();
  const openai = await checkOpenAI();
  const gemini = await checkGemini();

  console.log(`[SUPABASE] ${supabase.ok ? "OK" : "ERRO"} - ${supabase.detail}`);
  console.log(`[OPENAI]   ${openai.ok ? "OK" : "ERRO"} - ${openai.detail}`);
  console.log(`[GEMINI]   ${gemini.ok ? "OK" : "ERRO"} - ${gemini.detail}`);

  const aiReady = openai.ok || gemini.ok;
  const allReady = supabase.ok && aiReady;

  console.log("");
  if (!allReady) {
    console.log("Status final: incompleto.");
    console.log("Ajuste os itens com ERRO e rode novamente: npm run doctor");
    process.exit(1);
  }

  console.log("Status final: pronto para rodar.");
}

run().catch((error) => {
  console.error("Falha no doctor:", error);
  process.exit(1);
});
