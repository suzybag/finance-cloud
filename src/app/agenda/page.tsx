"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { VanishList } from "@/components/agenda/VanishList";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { supabase } from "@/lib/supabaseClient";

type AgendaEventRow = {
  id: string;
  user_id: string;
  user_email: string;
  title: string;
  description: string | null;
  event_at: string;
  alert_at: string;
  timezone: string;
  alert_enabled: boolean;
  email_sent_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number;
  email_error: string | null;
  created_at: string;
  updated_at: string | null;
};

type AgendaFormState = {
  title: string;
  description: string;
  eventAtLocal: string;
  alertAtLocal: string;
  alertEnabled: boolean;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const CARD_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(31,22,54,0.72),rgba(12,9,26,0.82))] p-4 backdrop-blur-xl";

const pad = (value: number) => String(value).padStart(2, "0");

const toLocalInput = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIsoFromLocalInput = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const getDefaultForm = (): AgendaFormState => {
  const now = new Date();
  now.setSeconds(0, 0);
  const eventAt = new Date(now.getTime() + 60 * 60 * 1000);
  const alertAt = new Date(eventAt.getTime() - 60 * 60 * 1000);
  return {
    title: "",
    description: "",
    eventAtLocal: toLocalInput(eventAt),
    alertAtLocal: toLocalInput(alertAt),
    alertEnabled: true,
  };
};

const EMPTY_FORM = getDefaultForm();

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeEvent = (row: Partial<AgendaEventRow>): AgendaEventRow => ({
  id: String(row.id || ""),
  user_id: String(row.user_id || ""),
  user_email: String(row.user_email || ""),
  title: String(row.title || ""),
  description: row.description ? String(row.description) : null,
  event_at: String(row.event_at || ""),
  alert_at: String(row.alert_at || ""),
  timezone: String(row.timezone || "America/Sao_Paulo"),
  alert_enabled: Boolean(row.alert_enabled),
  email_sent_at: row.email_sent_at || null,
  last_attempt_at: row.last_attempt_at || null,
  attempt_count: Number.isFinite(Number(row.attempt_count)) ? Number(row.attempt_count) : 0,
  email_error: row.email_error || null,
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || null,
});

const getStatus = (row: AgendaEventRow) => {
  if (!row.alert_enabled) {
    return {
      label: "Alerta desativado",
      className: "border-slate-400/30 bg-slate-500/15 text-slate-200",
    };
  }
  if (row.email_sent_at) {
    return {
      label: "Email enviado",
      className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
    };
  }

  const now = Date.now();
  const alertAt = new Date(row.alert_at).getTime();
  if (Number.isFinite(alertAt) && alertAt <= now) {
    return {
      label: "Aguardando envio",
      className: "border-amber-400/30 bg-amber-500/15 text-amber-200",
    };
  }

  return {
    label: "Pendente",
    className: "border-cyan-400/30 bg-cyan-500/15 text-cyan-200",
  };
};

const isMissingAgendaTableError = (message?: string | null) =>
  /relation .*agenda_events/i.test(message || "");

const formFromEvent = (row: AgendaEventRow): AgendaFormState => ({
  title: row.title,
  description: row.description || "",
  eventAtLocal: toLocalInput(row.event_at),
  alertAtLocal: toLocalInput(row.alert_at),
  alertEnabled: row.alert_enabled,
});

export default function AgendaPage() {
  const confirmDialog = useConfirmDialog();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAlerts, setRunningAlerts] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [events, setEvents] = useState<AgendaEventRow[]>([]);
  const [form, setForm] = useState<AgendaFormState>(EMPTY_FORM);
  const [editingEvent, setEditingEvent] = useState<AgendaEventRow | null>(null);
  const [editForm, setEditForm] = useState<AgendaFormState>(EMPTY_FORM);
  const [resolvedTimezone, setResolvedTimezone] = useState<string>("America/Sao_Paulo");

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setResolvedTimezone(tz);
    } catch {
      setResolvedTimezone("America/Sao_Paulo");
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setLoading(false);
      setFeedback("Sessao nao encontrada. Faca login novamente.");
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");

    const { data, error } = await supabase
      .from("agenda_events")
      .select("*")
      .eq("user_id", user.id)
      .order("event_at", { ascending: true });

    if (error) {
      setLoading(false);
      setFeedback(
        isMissingAgendaTableError(error.message)
          ? "Tabela agenda_events nao encontrada. Rode o supabase.sql atualizado."
          : `Falha ao carregar agenda: ${error.message}`,
      );
      return;
    }

    const normalized = ((data || []) as Partial<AgendaEventRow>[])
      .map((row) => normalizeEvent(row))
      .filter((row) => row.id && row.user_id && row.event_at && row.alert_at);

    setEvents(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setCurrentTimeMs(Date.now());
  }, [events.length]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime()),
    [events],
  );

  const upcomingCount = sortedEvents.filter((item) => new Date(item.event_at).getTime() >= currentTimeMs).length;
  const pendingCount = sortedEvents.filter((item) => item.alert_enabled && !item.email_sent_at).length;
  const sentCount = sortedEvents.filter((item) => !!item.email_sent_at).length;

  const parseForm = (state: AgendaFormState) => {
    const title = state.title.trim();
    const description = state.description.trim();
    const eventAtIso = toIsoFromLocalInput(state.eventAtLocal);
    const alertAtIso = toIsoFromLocalInput(state.alertAtLocal);
    return {
      title,
      description: description || null,
      eventAtIso,
      alertAtIso,
      alertEnabled: state.alertEnabled,
    };
  };

  const validateForm = (state: AgendaFormState) => {
    const parsed = parseForm(state);
    if (!parsed.title) return "Informe o compromisso.";
    if (!parsed.eventAtIso) return "Informe a data/hora do compromisso.";
    if (!parsed.alertAtIso) return "Informe a data/hora do alerta por email.";
    if (new Date(parsed.alertAtIso).getTime() > new Date(parsed.eventAtIso).getTime()) {
      return "O alerta precisa acontecer antes (ou no mesmo horario) do compromisso.";
    }
    return null;
  };

  const handleCreate = async () => {
    if (!userId || !userEmail) {
      setFeedback("Usuario sem email para envio de lembrete.");
      return;
    }

    const validationError = validateForm(form);
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    const parsed = parseForm(form);
    setSaving(true);
    setFeedback(null);

    const { error } = await supabase.from("agenda_events").insert({
      user_id: userId,
      user_email: userEmail,
      title: parsed.title,
      description: parsed.description,
      event_at: parsed.eventAtIso,
      alert_at: parsed.alertAtIso,
      timezone: resolvedTimezone,
      alert_enabled: parsed.alertEnabled,
      email_sent_at: null,
      last_attempt_at: null,
      attempt_count: 0,
      email_error: null,
    });

    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel salvar compromisso: ${error.message}`);
      return;
    }

    setForm(getDefaultForm());
    setFeedback("Compromisso salvo com sucesso.");
    await loadEvents();
  };

  const openEdit = (row: AgendaEventRow) => {
    setEditingEvent(row);
    setEditForm(formFromEvent(row));
  };

  const closeEdit = () => {
    setEditingEvent(null);
    setEditForm(EMPTY_FORM);
  };

  const handleSaveEdit = async () => {
    if (!editingEvent || !userId) return;

    const validationError = validateForm(editForm);
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    const parsed = parseForm(editForm);

    setSaving(true);
    setFeedback(null);

    const { error } = await supabase
      .from("agenda_events")
      .update({
        title: parsed.title,
        description: parsed.description,
        event_at: parsed.eventAtIso,
        alert_at: parsed.alertAtIso,
        timezone: resolvedTimezone,
        alert_enabled: parsed.alertEnabled,
        email_sent_at: null,
        last_attempt_at: null,
        attempt_count: 0,
        email_error: null,
      })
      .eq("id", editingEvent.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel editar compromisso: ${error.message}`);
      return;
    }

    closeEdit();
    setFeedback("Compromisso atualizado.");
    await loadEvents();
  };

  const handleDelete = async (row: AgendaEventRow) => {
    if (!userId) return;
    const confirmed = await confirmDialog({
      title: "Excluir compromisso?",
      description: `O compromisso "${row.title}" sera removido permanentemente.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("agenda_events")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);
    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel excluir compromisso: ${error.message}`);
      return;
    }

    setFeedback("Compromisso excluido.");
    await loadEvents();
  };

  const handleToggleAlert = async (row: AgendaEventRow) => {
    if (!userId) return;
    setSaving(true);
    setFeedback(null);

    const nextEnabled = !row.alert_enabled;
    const { error } = await supabase
      .from("agenda_events")
      .update({
        alert_enabled: nextEnabled,
        email_sent_at: nextEnabled ? null : row.email_sent_at,
        email_error: null,
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setFeedback(`Nao foi possivel alterar alerta: ${error.message}`);
      return;
    }

    setFeedback(nextEnabled ? "Alerta ativado." : "Alerta desativado.");
    await loadEvents();
  };

  const handleRunAlertsNow = async () => {
    setRunningAlerts(true);
    setFeedback(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setRunningAlerts(false);
      setFeedback("Sessao invalida para executar os alertas.");
      return;
    }

    const response = await fetch("/api/agenda/reminders/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      processed?: number;
      sent?: number;
      skipped?: number;
      failed?: number;
      message?: string;
    };
    setRunningAlerts(false);

    if (!response.ok || !data.ok) {
      setFeedback(data.message || "Falha ao executar lembretes.");
      return;
    }

    setFeedback(
      `Lembretes executados. Processados: ${data.processed || 0}, enviados: ${data.sent || 0}, ignorados: ${data.skipped || 0}, falhas: ${data.failed || 0}.`,
    );
    await loadEvents();
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-60"
        onClick={() => void handleRunAlertsNow()}
        disabled={runningAlerts}
      >
        {runningAlerts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
        Executar alertas
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30"
        onClick={() => void loadEvents()}
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Atualizar
      </button>
    </div>
  );

  return (
    <AppShell
      title="Agenda"
      subtitle="Compromissos com alarme automatico no email na data e hora configuradas"
      actions={actions}
      contentClassName="ultra-shell-bg"
    >
      {loading ? (
        <div className={`${CARD_CLASS} text-slate-200`}>Carregando agenda...</div>
      ) : (
        <div className="space-y-6">
          {feedback ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
              {feedback}
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3">
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Compromissos futuros</p>
              <p className="mt-2 text-3xl font-black text-white">{upcomingCount}</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Alertas pendentes</p>
              <p className="mt-2 text-3xl font-black text-cyan-200">{pendingCount}</p>
            </article>
            <article className={CARD_CLASS}>
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Emails enviados</p>
              <p className="mt-2 text-3xl font-black text-emerald-200">{sentCount}</p>
            </article>
          </section>

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                <CalendarClock className="h-5 w-5 text-violet-200" />
                Novo compromisso
              </h2>
              <span className="rounded-full border border-violet-300/25 bg-violet-900/35 px-3 py-1 text-[11px] font-semibold text-violet-100/90">
                Fuso: {resolvedTimezone}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Compromisso</span>
                <input
                  className={INPUT_CLASS}
                  value={form.title}
                  placeholder="Ex: Evento importante"
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Descricao (opcional)</span>
                <textarea
                  className={`${INPUT_CLASS} min-h-24 resize-y`}
                  value={form.description}
                  placeholder="Detalhes do compromisso"
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">
                  Data e hora do compromisso
                </span>
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  value={form.eventAtLocal}
                  onChange={(event) => setForm((prev) => ({ ...prev, eventAtLocal: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">
                  Data e hora do alerta no email
                </span>
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  value={form.alertAtLocal}
                  onChange={(event) => setForm((prev) => ({ ...prev, alertAtLocal: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 py-2 text-sm text-violet-100">
                <input
                  type="checkbox"
                  checked={form.alertEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, alertEnabled: event.target.checked }))}
                />
                Alerta por email ativo
              </label>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleCreate()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Salvar compromisso
              </button>
            </div>
          </section>

          <section className={`${CARD_CLASS} rounded-3xl`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-white">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                Compromissos cadastrados
              </h3>
              <span className="rounded-full border border-violet-300/25 bg-violet-900/35 px-3 py-1 text-[11px] font-semibold text-violet-100/85">
                {sortedEvents.length} item(ns)
              </span>
            </div>

            {!sortedEvents.length ? (
              <p className="rounded-xl border border-violet-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
                Nenhum compromisso cadastrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="px-3 py-1">Compromisso</th>
                      <th className="px-3 py-1">Evento</th>
                      <th className="px-3 py-1">Alerta email</th>
                      <th className="px-3 py-1">Status</th>
                      <th className="px-3 py-1">Ultimo envio</th>
                      <th className="px-3 py-1">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEvents.map((row) => {
                      const status = getStatus(row);
                      return (
                        <tr
                          key={row.id}
                          className="rounded-2xl border border-violet-300/20 bg-black/25 text-sm text-slate-100"
                        >
                          <td className="rounded-l-xl px-3 py-3">
                            <p className="font-semibold text-white">{row.title}</p>
                            <p className="mt-1 max-w-[260px] truncate text-xs text-slate-400">
                              {row.description || "-"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-xs">{formatDateTime(row.event_at)}</td>
                          <td className="px-3 py-3 text-xs">{formatDateTime(row.alert_at)}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-300">
                            {formatDateTime(row.email_sent_at)}
                            {row.email_error ? (
                              <p className="mt-1 max-w-[220px] truncate text-[11px] text-rose-300">
                                Erro: {row.email_error}
                              </p>
                            ) : null}
                          </td>
                          <td className="rounded-r-xl px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-violet-300/25 bg-violet-500/15 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/25"
                                onClick={() => openEdit(row)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                                onClick={() => void handleToggleAlert(row)}
                              >
                                {row.alert_enabled ? "Desativar alerta" : "Ativar alerta"}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
                                onClick={() => void handleDelete(row)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <VanishList />
        </div>
      )}

      {editingEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030f]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-violet-300/30 bg-[linear-gradient(160deg,rgba(33,16,56,0.95),rgba(13,9,30,0.95))] p-5 shadow-[0_28px_70px_rgba(74,29,150,0.45)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white">Editar compromisso</h3>
              <button
                type="button"
                className="rounded-lg border border-violet-300/30 px-2 py-1 text-xs text-violet-100 hover:bg-violet-500/20"
                onClick={closeEdit}
                disabled={saving}
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Compromisso</span>
                <input
                  className={INPUT_CLASS}
                  value={editForm.title}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Descricao</span>
                <textarea
                  className={`${INPUT_CLASS} min-h-24 resize-y`}
                  value={editForm.description}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Data/hora do evento</span>
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  value={editForm.eventAtLocal}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, eventAtLocal: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Data/hora do alerta</span>
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  value={editForm.alertAtLocal}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, alertAtLocal: event.target.value }))}
                />
              </label>
            </div>

            <label className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 py-2 text-sm text-violet-100">
              <input
                type="checkbox"
                checked={editForm.alertEnabled}
                onChange={(event) => setEditForm((prev) => ({ ...prev, alertEnabled: event.target.checked }))}
              />
              Alerta por email ativo
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-violet-300/30 bg-violet-950/40 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-900/40"
                onClick={closeEdit}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60"
                onClick={() => void handleSaveEdit()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Salvar alteracoes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
