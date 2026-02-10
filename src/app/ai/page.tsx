"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Account } from "@/lib/finance";
import { brl, toNumber } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";

type QuickParsedItem = {
  description: string;
  amount: number;
  type: "expense" | "income";
  category: string;
};

type QuickParseResponse = {
  items: QuickParsedItem[];
  summary: { description: string; total: number; type: "expense" | "income" }[];
  totals: { expense: number; income: number; balance: number };
  message?: string;
  out_of_scope?: boolean;
};

type GeneralChatResponse = {
  reply?: string;
  message?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type ChatThread = {
  id: string;
  title: string;
  mode: "solo" | "group";
  messages: ChatMessage[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const nowLabel = () =>
  new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

const normalizeHintText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const needsValueHint = (text: string) => {
  const normalized = normalizeHintText(text);
  const hasIntent = /(cdb|cbd|deposito|pix|resgate|rendimento|dividendo)/.test(normalized);
  const hasNumber = /\d/.test(normalized);
  return hasIntent && !hasNumber;
};

const WHATSAPP_CONNECT_URL =
  "https://api.whatsapp.com/send/?phone=19516668518&text=Send+this+message+to+connect+and+start+chatting%21%0A%0AActivation+code%3A+B44-7YRSMPFN&type=phone_number&app_absent=0";

export default function AiPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [quickText, setQuickText] = useState("");
  const [quickDate, setQuickDate] = useState(todayIso());
  const [quickAccountId, setQuickAccountId] = useState("");
  const [quickResult, setQuickResult] = useState<QuickParseResponse | null>(null);
  const [quickParsing, setQuickParsing] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([
    {
      id: "solo",
      title: "Nova conversa",
      mode: "solo",
      messages: [
        {
          id: "welcome",
          role: "assistant",
          text: "Oi, eu sou a Grana AI. Posso registrar lancamentos e tambem responder perguntas gerais.",
          time: nowLabel(),
        },
      ],
    },
    {
      id: "group",
      title: "Grupo Financeiro",
      mode: "group",
      messages: [
        {
          id: "group-welcome",
          role: "assistant",
          text: "Este e um chat em grupo sem telefone. Digite mensagens e eu ajudo com os lancamentos.",
          time: nowLabel(),
        },
      ],
    },
  ]);
  const [currentThreadId, setCurrentThreadId] = useState("solo");

  const loadBaseData = async () => {
    setLoading(true);
    const [accountsRes, userRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.auth.getUser(),
    ]);

    setUserId(userRes.data.user?.id ?? null);

    if (accountsRes.error) {
      setMessage(accountsRes.error.message || "Falha ao carregar contas.");
      setLoading(false);
      return;
    }

    setAccounts((accountsRes.data as Account[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  const parsedCount = useMemo(() => quickResult?.items.length ?? 0, [quickResult]);

  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId) ?? threads[0],
    [threads, currentThreadId],
  );

  const messages = currentThread?.messages ?? [];

  const conversationList = useMemo(
    () =>
      threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        count: thread.messages.length,
        active: thread.id === currentThreadId,
        mode: thread.mode,
      })),
    [threads, currentThreadId],
  );

  const appendMessage = (role: "user" | "assistant", text: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === currentThreadId
          ? {
              ...thread,
              messages: [...thread.messages, { id, role, text, time: nowLabel() }],
            }
          : thread,
      ),
    );
  };

  const createConversation = () => {
    const id = `conv-${Date.now().toString(36)}`;
    const newThread: ChatThread = {
      id,
      title: "Nova conversa",
      mode: "solo",
      messages: [
        {
          id: `${id}-welcome`,
          role: "assistant",
          text: "Oi, eu sou a Grana AI. Em que posso ajudar?",
          time: nowLabel(),
        },
      ],
    };
    setThreads((prev) => [newThread, ...prev]);
    setCurrentThreadId(id);
  };

  const parseQuickText = async (rawText?: string) => {
    const text = (rawText ?? quickText).trim();
    if (!text) {
      setMessage("Digite sua frase. Ex: hoje gastei 23 em uber e 25 netflix.");
      return;
    }

    appendMessage("user", text);
    setQuickText("");
    setQuickParsing(true);
    setMessage(null);

    const askGeneralChat = async () => {
      const history = messages.slice(-8).map((item) => ({
        role: item.role,
        text: item.text,
      }));

      const chatResponse = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history }),
      });

      const chatData = (await chatResponse.json()) as GeneralChatResponse;
      const chatMessage =
        chatData.reply ||
        chatData.message ||
        "Nao consegui responder agora. Tente novamente em alguns segundos.";

      if (!chatResponse.ok) {
        setMessage(chatMessage);
      } else {
        setMessage(null);
      }
      appendMessage("assistant", chatMessage);
    };

    try {
      const response = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      if (!response.ok) {
        await askGeneralChat();
        return;
      }

      const result = data as QuickParseResponse;
      if (result.out_of_scope) {
        setQuickResult(null);
        await askGeneralChat();
        return;
      }

      setQuickResult(result);

      if (result.items.length) {
        setMessage(`${result.items.length} lancamentos identificados.`);
        appendMessage(
          "assistant",
          `Identifiquei ${result.items.length} lancamentos. Gastos: ${brl(
            result.totals.expense,
          )}. Depositos: ${brl(result.totals.income)}. Clique em \"Salvar em Gastos\".`,
        );
        return;
      }

      if (needsValueHint(text)) {
        setMessage("Entendi CDB/deposito, mas faltou o valor.");
        appendMessage("assistant", "Entendi CDB/deposito. Envie com valor. Ex: deposito 500 em cdb.");
        return;
      }

      setQuickResult(null);
      await askGeneralChat();
    } catch {
      await askGeneralChat();
    } finally {
      setQuickParsing(false);
    }
  };

  const saveQuickItems = async () => {
    if (!userId) {
      setMessage("Sessao nao carregada.");
      return;
    }

    const items = quickResult?.items ?? [];
    if (!items.length) {
      setMessage("Nao ha itens para salvar.");
      return;
    }

    setQuickSaving(true);
    setMessage(null);

    const noteText = messages
      .filter((item) => item.role === "user")
      .slice(-1)[0]
      ?.text?.trim();
    const note = noteText ? `Texto original: ${noteText.slice(0, 220)}` : null;

    const rows = items.map((item) => ({
      user_id: userId,
      type: item.type,
      occurred_at: quickDate,
      description: item.description,
      category: item.category || null,
      amount: Math.abs(toNumber(item.amount)),
      account_id: quickAccountId || null,
      to_account_id: null,
      card_id: null,
      tags: ["ai_texto"],
      note,
    }));

    const { error } = await supabase.from("transactions").insert(rows);
    if (error) {
      setMessage(error.message || "Falha ao salvar.");
      setQuickSaving(false);
      return;
    }

    setMessage(`${rows.length} lancamentos salvos em Gastos.`);
    appendMessage("assistant", `Pronto. Salvei ${rows.length} lancamentos na lista de Gastos.`);
    setQuickResult(null);
    setQuickSaving(false);
  };

  const actions = (
    <div className="flex items-center gap-2">
      <Link
        href="/gastos"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
      >
        Abrir Gastos
      </Link>
      <button
        type="button"
        className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/55"
        onClick={loadBaseData}
      >
        Atualizar
      </button>
    </div>
  );

  return (
    <AppShell title="AI" subtitle="Escreva gastos e receitas em texto livre" actions={actions}>
      <div className="space-y-4">
        {message ? (
          <div className="rounded-xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="glass-panel p-6 text-slate-300">Carregando...</div>
        ) : (
          <>
            <section className="grid gap-6 lg:grid-cols-[280px,1fr]">
              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Conversas</h2>
                  <button
                    type="button"
                    onClick={createConversation}
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-slate-950/40 p-2 text-slate-200 transition hover:bg-slate-900/55"
                    aria-label="Criar nova conversa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {conversationList.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setCurrentThreadId(conversation.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        conversation.active
                          ? "border-violet-300/30 bg-violet-400/15 text-violet-100"
                          : "border-white/10 bg-slate-950/35 text-slate-200 hover:bg-slate-900/55"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{conversation.title}</p>
                        {conversation.mode === "group" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-300">
                            <Users className="h-3 w-3" />
                            Grupo
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs opacity-80">
                        {conversation.count} {conversation.count === 1 ? "mensagem" : "mensagens"}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <a
                    href={WHATSAPP_CONNECT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Conectar WhatsApp
                  </a>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Sem telefone? Use o chat em grupo aqui ao lado.
                  </p>
                </div>
              </div>

              <div className="glass-panel flex flex-col overflow-hidden p-0">
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-sm font-bold text-violet-100">
                      AI
                    </span>
                    <div>
                      <p className="text-xl font-extrabold tracking-tight text-slate-100">Grana AI</p>
                      <p className="text-sm text-slate-300">
                        {currentThread?.mode === "group"
                          ? "Chat em grupo sem telefone"
                          : "Seu assistente financeiro inteligente"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {messages.map((chat) => {
                    const userBubble = chat.role === "user";
                    return (
                      <div key={chat.id} className={`flex ${userBubble ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[88%] rounded-2xl border px-3 py-2 ${
                            userBubble
                              ? "border-violet-300/20 bg-violet-500/20 text-violet-100"
                              : "border-white/10 bg-slate-950/35 text-slate-100"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">{chat.text}</p>
                          <p className="mt-1 text-right text-[11px] opacity-70">{chat.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-white/10 px-5 py-4">
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100 outline-none"
                    placeholder="Digite sua mensagem... Ex: uber 27,90 ou 'me explique o que e CDB'"
                    value={quickText}
                    onChange={(event) => setQuickText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          parseQuickText(quickText);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-400 disabled:opacity-60"
                      onClick={() => parseQuickText(quickText)}
                      disabled={quickParsing}
                    >
                      {quickParsing ? "..." : "Enviar"}
                    </button>
                  </div>

                  <p className="mt-2 text-center text-xs text-slate-400">
                    Dica: pode perguntar qualquer tema ou enviar gastos para salvar no app
                  </p>
                </div>
              </div>
            </section>

            {quickResult ? (
              <section className="glass-panel p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Despesa total</p>
                    <p className="text-xl font-extrabold text-rose-300">-{brl(quickResult.totals.expense)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Receita total</p>
                    <p className="text-xl font-extrabold text-emerald-300">+{brl(quickResult.totals.income)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                    <p className="text-xs text-slate-400">Resultado</p>
                    <p
                      className={`text-xl font-extrabold ${
                        quickResult.totals.balance >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {brl(quickResult.totals.balance)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    type="date"
                    className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                    value={quickDate}
                    onChange={(event) => setQuickDate(event.target.value)}
                  />

                  <select
                    className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-slate-100"
                    value={quickAccountId}
                    onChange={(event) => setQuickAccountId(event.target.value)}
                  >
                    <option value="">Conta padrao (opcional)</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 space-y-2">
                  {quickResult.items.map((item, index) => {
                    const isIncome = item.type === "income";
                    return (
                      <div
                        key={`${item.description}-${item.amount}-${index}`}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-extrabold ${
                              isIncome
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {isIncome ? "+" : "-"}
                          </span>
                          <div>
                            <p className="font-semibold text-slate-100">{item.description}</p>
                            <p className="text-xs text-slate-400">{item.category}</p>
                          </div>
                        </div>
                        <p className={`font-extrabold ${isIncome ? "text-emerald-300" : "text-rose-300"}`}>
                          {isIncome ? "+" : "-"}
                          {brl(item.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    onClick={saveQuickItems}
                    disabled={quickSaving || parsedCount === 0}
                  >
                    {quickSaving ? "Salvando..." : "Salvar em Gastos"}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

