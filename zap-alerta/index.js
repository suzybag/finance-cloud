import "dotenv/config";
import { createServer } from "node:http";
import { Boom } from "@hapi/boom";
import { createClient } from "@supabase/supabase-js";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as getMultiFileAuthState,
} from "@whiskeysockets/baileys";
import cron from "node-cron";
import OpenAI from "openai";
import pino from "pino";
import qrcode from "qrcode-terminal";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GEMINIT_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-2.0-flash")
  .replace(/[`'"\s]+$/g, "")
  .replace(/^models\//, "")
  .trim();
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || null;
const DEFAULT_ALERT_DAYS = clampInt(process.env.DEFAULT_ALERT_DAYS || "3", 1, 30);
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 9 * * *";
const CRON_TZ = process.env.CRON_TZ || "America/Sao_Paulo";
const NEXT_ALERTS_ENDPOINT = process.env.NEXT_ALERTS_ENDPOINT || "";
const NEXT_ALERTS_TOKEN = process.env.NEXT_ALERTS_TOKEN || "";
const BOT_PORT = Number(process.env.BOT_PORT || 3100);
const BOT_HTTP_TOKEN = process.env.BOT_HTTP_TOKEN || "";
const DEFAULT_ALERT_PHONE = process.env.DEFAULT_ALERT_PHONE || "";

if (!SUPABASE_URL) {
  throw new Error("Env obrigatoria ausente: SUPABASE_URL");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Env obrigatoria ausente: SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY).",
  );
}
const HAS_SUPABASE_ADMIN_KEY = !SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const runtime = {
  socket: null,
};

if (!HAS_SUPABASE_ADMIN_KEY) {
  logger.warn(
    "Supabase em modo limitado (chave publishable). Funcoes financeiras avancadas ficam restritas ate configurar SERVICE ROLE/sb_secret.",
  );
}

function clampInt(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date, months) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function safeSetDay(date, day) {
  const value = new Date(date.getFullYear(), date.getMonth(), 1);
  const max = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.max(1, Math.min(max, Number(day) || 1)));
  return startOfDay(value);
}

function diffDays(fromDate, toDate) {
  const ms = startOfDay(toDate).getTime() - startOfDay(fromDate).getTime();
  return Math.round(ms / 86_400_000);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateBR(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function jidToPhone(jid) {
  const local = String(jid || "").split("@")[0].split(":")[0];
  return normalizePhone(local);
}

function phoneToJid(phone) {
  const normalized = normalizePhone(phone);
  return `${normalized}@s.whatsapp.net`;
}

function extractTextFromMessage(message) {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return "";
}

function computeCycleForBase(card, baseDate) {
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

function computeNextCycle(card, now = new Date()) {
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

function sanitizeIntent(rawIntent) {
  const safeIntent = ["card_due", "set_alert_days", "next_invoice", "general"].includes(
    rawIntent?.intent,
  )
    ? rawIntent.intent
    : "general";

  return {
    intent: safeIntent,
    card_name: rawIntent?.card_name ? String(rawIntent.card_name) : null,
    days:
      typeof rawIntent?.days === "number"
        ? clampInt(rawIntent.days, 1, 30)
        : null,
    question: rawIntent?.question ? String(rawIntent.question) : null,
  };
}

function parseIntentFallback(text) {
  const normalized = normalizeText(text);
  const dayMatch = normalized.match(/(\d+)\s*dias?/);
  const days = dayMatch ? clampInt(dayMatch[1], 1, 30) : null;

  if ((/me avise|me avisa|avise|avisa|lembr/.test(normalized) || /faltar/.test(normalized)) && days) {
    return { intent: "set_alert_days", card_name: null, days, question: null };
  }

  if (/proxima fatura|proximo vencimento|qual e minha proxima fatura|qual minha proxima fatura/.test(normalized)) {
    return { intent: "next_invoice", card_name: null, days: null, question: null };
  }

  if (/quando .* vence|vencimento|vence quando/.test(normalized)) {
    const known = ["nubank", "inter", "bradesco", "mercado pago", "xp", "btg"];
    const cardName = known.find((name) => normalized.includes(name)) || null;
    return { intent: "card_due", card_name: cardName, days: null, question: null };
  }

  return { intent: "general", card_name: null, days: null, question: text };
}

async function askGemini({ systemPrompt, userPrompt, temperature = 0, expectJson = false }) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao configurada.");
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${GEMINI_API_KEY}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature,
        ...(expectJson ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini falhou: ${response.status} ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new Error("Gemini retornou resposta vazia.");
  }

  return text;
}

async function parseIntentWithAI(text) {
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Voce extrai intencao de comandos financeiros em portugues. Responda APENAS JSON com: intent, card_name, days, question. " +
              "intent permitido: card_due, set_alert_days, next_invoice, general.",
          },
          { role: "user", content: text },
        ],
      });

      const content = completion.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return sanitizeIntent(parsed);
    } catch (error) {
      logger.warn({ error }, "OpenAI falhou ao interpretar intencao. Tentando Gemini.");
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const raw = await askGemini({
        systemPrompt:
          "Voce extrai intencao de comandos financeiros em portugues. Responda APENAS JSON com: intent, card_name, days, question. " +
          "intent permitido: card_due, set_alert_days, next_invoice, general.",
        userPrompt: text,
        temperature: 0,
        expectJson: true,
      });
      return sanitizeIntent(JSON.parse(raw));
    } catch (error) {
      logger.warn({ error }, "Gemini falhou ao interpretar intencao. Usando fallback local.");
    }
  }

  return parseIntentFallback(text);
}

async function answerWithDuckDuckGo(question) {
  try {
    const url =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(question)}` +
      "&format=json&no_html=1&skip_disambig=1";
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const abstract = String(payload?.AbstractText || "").trim();
    if (abstract) return abstract;

    const firstTopic = payload?.RelatedTopics?.find?.((item) => item?.Text)?.Text;
    if (firstTopic) return String(firstTopic).trim();
    return null;
  } catch {
    return null;
  }
}

async function answerWithWikipedia(question) {
  try {
    const searchUrl =
      "https://pt.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: question,
        utf8: "1",
        format: "json",
        srlimit: "1",
      }).toString();

    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) return null;
    const searchPayload = await searchResp.json();
    const title = searchPayload?.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryUrl =
      "https://pt.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title);
    const summaryResp = await fetch(summaryUrl);
    if (!summaryResp.ok) return null;
    const summary = await summaryResp.json();
    const extract = String(summary?.extract || "").trim();
    if (!extract) return null;
    return `${extract}\n\nFonte: Wikipedia (${title})`;
  } catch {
    return null;
  }
}

async function answerWithGeocoding(question) {
  try {
    const match = String(question || "").match(/onde\s+fica\s+(.+)/i);
    if (!match?.[1]) return null;
    const place = match[1].trim();
    if (!place) return null;

    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: place,
        format: "jsonv2",
        limit: "1",
      }).toString();

    const response = await fetch(url, {
      headers: {
        "User-Agent": "finance-cloud-bot/1.0",
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const first = payload?.[0];
    if (!first?.display_name) return null;
    return `Encontrei: ${first.display_name}\n\nFonte: OpenStreetMap`;
  } catch {
    return null;
  }
}

async function resolveSubscriber(phoneE164) {
  const { data, error } = await supabase
    .from("whatsapp_subscribers")
    .select("id, user_id, phone_e164, name, alert_days, active")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) return data;

  if (!DEFAULT_USER_ID) {
    return null;
  }

  const insertPayload = {
    user_id: DEFAULT_USER_ID,
    phone_e164: phoneE164,
    alert_days: DEFAULT_ALERT_DAYS,
    active: true,
  };

  const { data: created, error: createError } = await supabase
    .from("whatsapp_subscribers")
    .insert(insertPayload)
    .select("id, user_id, phone_e164, name, alert_days, active")
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

async function loadCards(userId) {
  const { data, error } = await supabase
    .from("cards")
    .select("id, name, issuer, closing_day, due_day")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at");

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadInvoiceAmount(userId, card, cycleStart, cycleEnd) {
  const { data, error } = await supabase
    .from("transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .eq("card_id", card.id)
    .gte("occurred_at", toIsoDate(cycleStart))
    .lte("occurred_at", toIsoDate(cycleEnd))
    .neq("type", "card_payment");

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, tx) => {
    const value = Math.abs(Number(tx.amount || 0));
    if (!Number.isFinite(value)) return sum;
    if (tx.type === "income") return sum - value;
    if (tx.type === "transfer") return sum;
    return sum + value;
  }, 0);
}

async function buildCardSnapshot(userId, card, now = new Date()) {
  const cycle = computeNextCycle(card, now);
  const amount = await loadInvoiceAmount(userId, card, cycle.cycleStart, cycle.cycleEnd);
  return {
    card,
    amount,
    cycleStart: cycle.cycleStart,
    cycleEnd: cycle.cycleEnd,
    dueDate: cycle.dueDate,
    daysLeft: cycle.daysLeft,
  };
}

function findCardByName(snapshots, cardName) {
  if (!cardName) return null;
  const needle = normalizeText(cardName).replace(/[^a-z0-9]/g, "");
  if (!needle) return null;

  return (
    snapshots.find((item) => {
      const byName = normalizeText(item.card.name).replace(/[^a-z0-9]/g, "");
      const byIssuer = normalizeText(item.card.issuer || "").replace(/[^a-z0-9]/g, "");
      return byName.includes(needle) || byIssuer.includes(needle) || needle.includes(byName);
    }) || null
  );
}

function getNextInvoice(snapshots) {
  if (!snapshots.length) return null;
  return [...snapshots].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
}

function formatCardDue(snapshot) {
  const cardName = snapshot.card.name || snapshot.card.issuer || "Cartao";
  return (
    `📅 *${cardName}*\n` +
    `Vencimento: *${formatDateBR(snapshot.dueDate)}* (${snapshot.daysLeft} dia(s))\n` +
    `Fatura atual: *${formatCurrency(snapshot.amount)}*`
  );
}

function formatAlert(snapshot) {
  return (
    `🔔 *Aviso de Cartao*\n` +
    `Seu cartao *${snapshot.card.name}* vence em *${snapshot.daysLeft} dias*.\n` +
    `📅 Vencimento: ${formatDateBR(snapshot.dueDate)}\n` +
    `💵 Valor da fatura: ${formatCurrency(snapshot.amount)}\n\n` +
    `Nao esqueca de pagar!`
  );
}

async function answerGeneralWithAI(question, snapshots, subscriber) {
  const context = snapshots.length
    ? snapshots
        .map(
          (item) =>
            `${item.card.name} | vence ${formatDateBR(item.dueDate)} | fatura ${formatCurrency(item.amount)} | faltam ${item.daysLeft} dias`,
        )
        .join("\n")
    : "Nenhum cartao cadastrado para este usuario.";

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Voce e um assistente financeiro no WhatsApp. Responda em portugues do Brasil, curto e claro. " +
              "Use apenas os dados do contexto quando a pergunta for sobre cartoes/faturas.",
          },
          {
            role: "user",
            content:
              `Contexto do usuario ${subscriber.user_id}:\n${context}\n\nPergunta:\n${question}`,
          },
        ],
      });
      return completion.choices?.[0]?.message?.content?.trim() || "Nao consegui responder agora.";
    } catch (error) {
      logger.warn({ error }, "OpenAI falhou na resposta geral. Tentando Gemini.");
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const text = await askGemini({
        systemPrompt:
          "Voce e um assistente financeiro no WhatsApp. Responda em portugues do Brasil, curto e claro. " +
          "Use apenas os dados do contexto quando a pergunta for sobre cartoes/faturas.",
        userPrompt:
          `Contexto do usuario ${subscriber.user_id}:\n${context}\n\nPergunta:\n${question}`,
        temperature: 0.2,
        expectJson: false,
      });
      return text;
    } catch (error) {
      logger.warn({ error }, "Gemini falhou na resposta geral.");
    }
  }

  const webAnswer = await answerWithDuckDuckGo(question);
  if (webAnswer) {
    return `${webAnswer}\n\nFonte: DuckDuckGo`;
  }

  const geoAnswer = await answerWithGeocoding(question);
  if (geoAnswer) {
    return geoAnswer;
  }

  const wikiAnswer = await answerWithWikipedia(question);
  if (wikiAnswer) {
    return wikiAnswer;
  }

  return (
    "Nao consegui responder com IA agora. Comandos suportados:\n" +
    "- Quando o cartao Nubank vence?\n" +
    "- Me avise quando faltar 3 dias\n" +
    "- Qual e minha proxima fatura?"
  );
}

async function saveIncomingLog(phone, text, parsed, subscriber) {
  try {
    await supabase.from("whatsapp_messages").insert({
      user_id: subscriber?.user_id || null,
      from_number: phone,
      body: text,
      parsed,
      status: "processed",
    });
  } catch (error) {
    logger.warn({ error }, "Falha ao gravar log em whatsapp_messages.");
  }
}

async function handleUserCommand(text, subscriber) {
  const parsed = await parseIntentWithAI(text);
  let snapshots = [];
  let financeUnavailableReason = "";
  try {
    snapshots = await Promise.all(
      (await loadCards(subscriber.user_id)).map((card) => buildCardSnapshot(subscriber.user_id, card)),
    );
  } catch (error) {
    financeUnavailableReason =
      "Nao consegui acessar seus cartoes no banco agora. Verifique a chave SUPABASE_SERVICE_ROLE_KEY.";
    logger.warn({ error }, "Falha ao carregar cartoes/snapshots.");
  }

  if (!snapshots.length && !financeUnavailableReason) {
    return {
      reply:
        "Voce ainda nao tem cartoes cadastrados. Crie em /cards para eu monitorar vencimento e fatura.",
      parsed,
    };
  }

  if (parsed.intent === "set_alert_days") {
    if (financeUnavailableReason) {
      return { reply: financeUnavailableReason, parsed };
    }
    const days = parsed.days || DEFAULT_ALERT_DAYS;
    await supabase
      .from("whatsapp_subscribers")
      .update({ alert_days: days })
      .eq("id", subscriber.id);

    return {
      reply: `Perfeito. Vou te avisar quando faltar *${days} dia(s)* para o vencimento dos seus cartoes.`,
      parsed: { ...parsed, days },
    };
  }

  if (parsed.intent === "card_due") {
    if (financeUnavailableReason) {
      return { reply: financeUnavailableReason, parsed };
    }
    const match = findCardByName(snapshots, parsed.card_name);
    const selected = match || getNextInvoice(snapshots);
    if (!selected) {
      return { reply: "Nao encontrei cartoes para consultar.", parsed };
    }
    return { reply: formatCardDue(selected), parsed };
  }

  if (parsed.intent === "next_invoice") {
    if (financeUnavailableReason) {
      return { reply: financeUnavailableReason, parsed };
    }
    const next = getNextInvoice(snapshots);
    if (!next) return { reply: "Nao encontrei sua proxima fatura.", parsed };
    return {
      reply:
        `🧾 *Proxima fatura*\n` +
        `Cartao: *${next.card.name}*\n` +
        `Vencimento: *${formatDateBR(next.dueDate)}* (${next.daysLeft} dia(s))\n` +
        `Valor: *${formatCurrency(next.amount)}*`,
      parsed,
    };
  }

  const smartReply = await answerGeneralWithAI(parsed.question || text, snapshots, subscriber);
  return { reply: smartReply, parsed };
}

async function fetchAlertsFromBackend(subscriber) {
  if (!NEXT_ALERTS_ENDPOINT) return null;

  const response = await fetch(NEXT_ALERTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(NEXT_ALERTS_TOKEN ? { "x-bot-token": NEXT_ALERTS_TOKEN } : {}),
    },
    body: JSON.stringify({
      userId: subscriber.user_id,
      alertDays: subscriber.alert_days || DEFAULT_ALERT_DAYS,
    }),
  });

  if (!response.ok) {
    throw new Error(`Backend alerts endpoint falhou: ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.alerts)) return [];
  return payload.alerts;
}

async function collectLocalAlerts(subscriber, now = new Date()) {
  const cards = await loadCards(subscriber.user_id);
  const snapshots = await Promise.all(cards.map((card) => buildCardSnapshot(subscriber.user_id, card, now)));
  const targetDays = clampInt(subscriber.alert_days || DEFAULT_ALERT_DAYS, 1, 30);
  return snapshots.filter((item) => item.daysLeft === targetDays);
}

function formatBackendAlert(alert) {
  if (alert?.message) return String(alert.message);
  return (
    `🔔 *Aviso de Cartao*\n` +
    `Seu cartao *${alert?.cardName || "Cartao"}* vence em *${alert?.daysLeft ?? "?"} dias*.\n` +
    `📅 Vencimento: ${alert?.dueDate || "-"}\n` +
    `💵 Valor da fatura: ${formatCurrency(alert?.amount || 0)}`
  );
}

async function sendMessageToTarget(target, text) {
  if (!runtime.socket) {
    throw new Error("WhatsApp ainda nao conectado.");
  }

  const jid = String(target).includes("@")
    ? String(target)
    : phoneToJid(target || DEFAULT_ALERT_PHONE);

  if (!jid || !jid.includes("@")) {
    throw new Error("Destino invalido para envio WhatsApp.");
  }

  await runtime.socket.sendMessage(jid, { text });
}

async function runDailyAlerts() {
  if (!runtime.socket) {
    logger.warn("Cron executou, mas socket WhatsApp ainda nao esta conectado.");
    return;
  }

  const { data: subscribers, error } = await supabase
    .from("whatsapp_subscribers")
    .select("id, user_id, phone_e164, alert_days, active")
    .eq("active", true);

  if (error) {
    logger.error({ error }, "Erro ao buscar assinantes.");
    return;
  }

  for (const subscriber of subscribers || []) {
    try {
      const targetJid = phoneToJid(subscriber.phone_e164);

      let sent = 0;
      if (NEXT_ALERTS_ENDPOINT) {
        const backendAlerts = await fetchAlertsFromBackend(subscriber);
        for (const alert of backendAlerts || []) {
          await runtime.socket.sendMessage(targetJid, { text: formatBackendAlert(alert) });
          sent += 1;
        }
      } else {
        const localAlerts = await collectLocalAlerts(subscriber);
        for (const item of localAlerts) {
          await runtime.socket.sendMessage(targetJid, { text: formatAlert(item) });
          sent += 1;
        }
      }

      if (sent > 0) {
        logger.info(
          { phone: subscriber.phone_e164, total: sent },
          "Alertas diarios enviados.",
        );
      }
    } catch (sendError) {
      logger.error(
        { sendError, phone: subscriber.phone_e164 },
        "Falha ao enviar alerta diario.",
      );
    }
  }
}

async function safeReadBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function startHttpServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        return jsonResponse(res, 200, { ok: true, connected: Boolean(runtime.socket) });
      }

      if (req.method === "POST" && url.pathname === "/enviar-alerta") {
        if (BOT_HTTP_TOKEN) {
          const provided = req.headers["x-bot-token"];
          if (provided !== BOT_HTTP_TOKEN) {
            return jsonResponse(res, 401, { ok: false, error: "token invalido" });
          }
        }

        const raw = await safeReadBody(req);
        const payload = raw ? JSON.parse(raw) : {};
        const text = payload?.texto || payload?.text;
        const target = payload?.phone || payload?.jid || DEFAULT_ALERT_PHONE;

        if (!text) {
          return jsonResponse(res, 400, { ok: false, error: "campo texto/text obrigatorio" });
        }
        if (!target) {
          return jsonResponse(res, 400, { ok: false, error: "campo phone/jid obrigatorio" });
        }

        await sendMessageToTarget(target, String(text));
        return jsonResponse(res, 200, { ok: true, target });
      }

      return jsonResponse(res, 404, { ok: false, error: "rota nao encontrada" });
    } catch (error) {
      logger.error({ error }, "Erro no servidor HTTP do bot.");
      return jsonResponse(res, 500, { ok: false, error: "erro interno" });
    }
  });

  const tryListen = (port, attempt = 0) => {
    const maxAttempts = 10;
    server.listen(port, () => {
      logger.info(`HTTP do bot ativo em http://localhost:${port}`);
    });

    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE" && attempt < maxAttempts) {
        const nextPort = port + 1;
        logger.warn(
          { port, nextPort },
          "Porta ocupada, tentando proxima porta automaticamente.",
        );
        setTimeout(() => tryListen(nextPort, attempt + 1), 200);
        return;
      }
      logger.error({ error }, "Falha ao iniciar servidor HTTP do bot.");
    });
  };

  tryListen(BOT_PORT);
}

async function connectWhatsApp() {
  const { state, saveCreds } = await getMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Finance Cloud", "Chrome", "1.0.0"],
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
      logger.info("Escaneie o QR Code acima para conectar o WhatsApp.");
    }

    if (connection === "open") {
      runtime.socket = socket;
      logger.info("✅ WhatsApp conectado.");
    }

    if (connection === "close") {
      runtime.socket = null;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ statusCode, shouldReconnect }, "Conexao WhatsApp encerrada.");

      if (shouldReconnect) {
        setTimeout(() => {
          connectWhatsApp().catch((error) => logger.error({ error }, "Erro ao reconectar."));
        }, 3_000);
      } else {
        logger.error("Sessao desconectada (logged out). Apague pasta auth/ e reconecte.");
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg?.message || msg.key?.fromMe) continue;
        const remoteJid = msg.key?.remoteJid || "";
        if (!remoteJid.endsWith("@s.whatsapp.net")) continue;

        const text = extractTextFromMessage(msg.message).trim();
        if (!text) continue;

        const phone = jidToPhone(remoteJid);
        const subscriber = await resolveSubscriber(phone);

        if (!subscriber) {
          const onboarding =
            "Encontrei sua mensagem, mas seu numero ainda nao esta vinculado a um usuario.\n" +
            "Cadastre em public.whatsapp_subscribers ou defina DEFAULT_USER_ID no bot.";
          await socket.sendMessage(remoteJid, { text: onboarding });
          continue;
        }

        if (!subscriber.active) {
          await socket.sendMessage(remoteJid, { text: "Seu alerta esta desativado no momento." });
          continue;
        }

        const { reply, parsed } = await handleUserCommand(text, subscriber);
        await socket.sendMessage(remoteJid, { text: reply });
        await saveIncomingLog(phone, text, parsed, subscriber);
      } catch (error) {
        logger.error({ error }, "Falha ao processar mensagem recebida.");
        try {
          const remoteJid = msg?.key?.remoteJid;
          if (remoteJid) {
            await socket.sendMessage(remoteJid, {
              text:
                "Tive um erro interno agora, mas continuo online. Tente novamente em alguns segundos.",
            });
          }
        } catch {
          // ignore
        }
      }
    }
  });
}

async function start() {
  startHttpServer();

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        await runDailyAlerts();
      } catch (error) {
        logger.error({ error }, "Falha no cron diario.");
      }
    },
    { timezone: CRON_TZ },
  );

  logger.info(`Cron ativo: "${CRON_SCHEDULE}" timezone=${CRON_TZ}`);
  logger.info(
    {
      openaiConfigured: Boolean(openai),
      geminiConfigured: Boolean(GEMINI_API_KEY),
      geminiModel: GEMINI_MODEL,
    },
    "Provedores de IA",
  );
  await connectWhatsApp();
}

start().catch((error) => {
  logger.error({ error }, "Falha fatal ao iniciar bot.");
  process.exit(1);
});
