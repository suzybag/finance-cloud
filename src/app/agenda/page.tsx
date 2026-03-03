"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { VanishList } from "@/components/agenda/VanishList";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { getDashboardCountdownEventIds, setDashboardCountdownEventIds } from "@/lib/agendaDashboardCountdown";
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

const getTodayInputDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const extractDatePart = (localDateTimeValue: string) => {
  const [datePart] = String(localDateTimeValue || "").split("T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart || "")) return datePart;
  return getTodayInputDate();
};

const mergeDateWithLocalTime = (currentLocalDateTime: string, nextDatePart: string) => {
  const timePartRaw = String(currentLocalDateTime || "").split("T")[1] || "09:00";
  const safeTimePart = /^\d{2}:\d{2}/.test(timePartRaw) ? timePartRaw.slice(0, 5) : "09:00";
  return `${nextDatePart}T${safeTimePart}`;
};

const formatInputDateLabel = (datePart: string) => {
  const parsed = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Escolher data";
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const anchorStyleFor = (name: string) => ({ anchorName: name } as CSSProperties & { anchorName: string });
const positionAnchorStyleFor = (name: string) => ({ positionAnchor: name } as CSSProperties & { positionAnchor: string });

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
  if (row.email_error) {
    return {
      label: "Falha no envio",
      className: "border-rose-400/30 bg-rose-500/15 text-rose-200",
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
  const [dashboardPickerOpen, setDashboardPickerOpen] = useState(false);
  const [dashboardEventIds, setDashboardEventIds] = useState<string[]>([]);
  const [dashboardDraftEventIds, setDashboardDraftEventIds] = useState<string[]>([]);

  useEffect(() => {
    void import("cally");
  }, []);

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
    const selectedIds = getDashboardCountdownEventIds(user.id);
    const validIds = selectedIds.filter((id) => normalized.some((row) => row.id === id));
    setDashboardEventIds(validIds);
    if (validIds.length !== selectedIds.length) {
      setDashboardCountdownEventIds(user.id, validIds);
    }
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
  const pendingCount = sortedEvents.filter((item) => item.alert_enabled && !item.email_sent_at && !item.email_error).length;
  const sentCount = sortedEvents.filter((item) => !!item.email_sent_at).length;

  const openDashboardPicker = () => {
    setDashboardDraftEventIds(dashboardEventIds);
    setDashboardPickerOpen(true);
  };

  const closeDashboardPicker = () => {
    setDashboardPickerOpen(false);
    setDashboardDraftEventIds([]);
  };

  const toggleDashboardDraftEvent = (eventId: string) => {
    setDashboardDraftEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]);
  };

  const handleSaveDashboardSelection = () => {
    if (!userId) {
      setFeedback("Sessao nao encontrada. Faca login novamente.");
      return;
    }
    const validSet = new Set(events.map((item) => item.id));
    const nextIds = dashboardDraftEventIds.filter((id) => validSet.has(id));
    setDashboardEventIds(nextIds);
    setDashboardCountdownEventIds(userId, nextIds);
    setDashboardPickerOpen(false);
    setDashboardDraftEventIds([]);
    setFeedback(
      nextIds.length
        ? `${nextIds.length} compromisso(s) adicionado(s) na dashboard.`
        : "Nenhum compromisso selecionado para a dashboard.",
    );
  };

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

    const response = await fetch("/api/agenda/daily-alerts", {
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
      errors?: string[];
    };
    setRunningAlerts(false);

    if (!response.ok || !data.ok) {
      setFeedback(data.message || "Falha ao executar resumo diario.");
      return;
    }

    const firstError = Array.isArray(data.errors) ? String(data.errors[0] || "") : "";
    const firstErrorText = firstError.replace(/^\[[^\]]+\]\s*/, "").slice(0, 180);
    setFeedback(
      `Resumo diario executado. Processados: ${data.processed || 0}, enviados: ${data.sent || 0}, ignorados: ${data.skipped || 0}, falhas: ${data.failed || 0}.${firstErrorText ? ` Primeiro erro: ${firstErrorText}` : ""}`,
    );
    await loadEvents();
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-blue-300/30 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/25"
        onClick={openDashboardPicker}
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        Adicionar a dashboard
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-60"
        onClick={() => void handleRunAlertsNow()}
        disabled={runningAlerts}
      >
        {runningAlerts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
        Executar resumo diario
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
                <div className="mt-2">
                  <button
                    type="button"
                    popoverTarget="agenda-create-event-date-popover"
                    id="agenda-create-event-date-anchor"
                    style={anchorStyleFor("--agenda-create-event-date-anchor")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-violet-200" />
                    {formatInputDateLabel(extractDatePart(form.eventAtLocal))}
                  </button>
                  <div
                    popover="auto"
                    id="agenda-create-event-date-popover"
                    className="dropdown mt-2 rounded-2xl border border-violet-300/20 bg-[#120d21] p-2 shadow-[0_22px_48px_rgba(7,4,16,0.62)]"
                    style={positionAnchorStyleFor("--agenda-create-event-date-anchor")}
                  >
                    <calendar-date
                      className="cally rounded-xl bg-[#120d21] text-violet-100"
                      value={extractDatePart(form.eventAtLocal)}
                      onChange={(event) => {
                        const target = event.currentTarget as HTMLElement & { value?: string };
                        const nextDate = String(target.value || "").trim();
                        if (!nextDate) return;
                        setForm((prev) => ({ ...prev, eventAtLocal: mergeDateWithLocalTime(prev.eventAtLocal, nextDate) }));
                      }}
                    >
                      <svg
                        aria-label="Anterior"
                        className="size-4 fill-current text-violet-100"
                        slot="previous"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
                      </svg>
                      <svg
                        aria-label="Proximo"
                        className="size-4 fill-current text-violet-100"
                        slot="next"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
                      </svg>
                      <calendar-month></calendar-month>
                    </calendar-date>
                  </div>
                </div>
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
                <div className="mt-2">
                  <button
                    type="button"
                    popoverTarget="agenda-create-alert-date-popover"
                    id="agenda-create-alert-date-anchor"
                    style={anchorStyleFor("--agenda-create-alert-date-anchor")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-violet-200" />
                    {formatInputDateLabel(extractDatePart(form.alertAtLocal))}
                  </button>
                  <div
                    popover="auto"
                    id="agenda-create-alert-date-popover"
                    className="dropdown mt-2 rounded-2xl border border-violet-300/20 bg-[#120d21] p-2 shadow-[0_22px_48px_rgba(7,4,16,0.62)]"
                    style={positionAnchorStyleFor("--agenda-create-alert-date-anchor")}
                  >
                    <calendar-date
                      className="cally rounded-xl bg-[#120d21] text-violet-100"
                      value={extractDatePart(form.alertAtLocal)}
                      onChange={(event) => {
                        const target = event.currentTarget as HTMLElement & { value?: string };
                        const nextDate = String(target.value || "").trim();
                        if (!nextDate) return;
                        setForm((prev) => ({ ...prev, alertAtLocal: mergeDateWithLocalTime(prev.alertAtLocal, nextDate) }));
                      }}
                    >
                      <svg
                        aria-label="Anterior"
                        className="size-4 fill-current text-violet-100"
                        slot="previous"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
                      </svg>
                      <svg
                        aria-label="Proximo"
                        className="size-4 fill-current text-violet-100"
                        slot="next"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
                      </svg>
                      <calendar-month></calendar-month>
                    </calendar-date>
                  </div>
                </div>
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
                              <p className="mt-1 max-w-[280px] whitespace-normal break-words text-[11px] text-rose-300">
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
                <div className="mt-2">
                  <button
                    type="button"
                    popoverTarget="agenda-edit-event-date-popover"
                    id="agenda-edit-event-date-anchor"
                    style={anchorStyleFor("--agenda-edit-event-date-anchor")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-violet-200" />
                    {formatInputDateLabel(extractDatePart(editForm.eventAtLocal))}
                  </button>
                  <div
                    popover="auto"
                    id="agenda-edit-event-date-popover"
                    className="dropdown mt-2 rounded-2xl border border-violet-300/20 bg-[#120d21] p-2 shadow-[0_22px_48px_rgba(7,4,16,0.62)]"
                    style={positionAnchorStyleFor("--agenda-edit-event-date-anchor")}
                  >
                    <calendar-date
                      className="cally rounded-xl bg-[#120d21] text-violet-100"
                      value={extractDatePart(editForm.eventAtLocal)}
                      onChange={(event) => {
                        const target = event.currentTarget as HTMLElement & { value?: string };
                        const nextDate = String(target.value || "").trim();
                        if (!nextDate) return;
                        setEditForm((prev) => ({ ...prev, eventAtLocal: mergeDateWithLocalTime(prev.eventAtLocal, nextDate) }));
                      }}
                    >
                      <svg
                        aria-label="Anterior"
                        className="size-4 fill-current text-violet-100"
                        slot="previous"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
                      </svg>
                      <svg
                        aria-label="Proximo"
                        className="size-4 fill-current text-violet-100"
                        slot="next"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
                      </svg>
                      <calendar-month></calendar-month>
                    </calendar-date>
                  </div>
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-violet-100/75">Data/hora do alerta</span>
                <input
                  className={INPUT_CLASS}
                  type="datetime-local"
                  value={editForm.alertAtLocal}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, alertAtLocal: event.target.value }))}
                />
                <div className="mt-2">
                  <button
                    type="button"
                    popoverTarget="agenda-edit-alert-date-popover"
                    id="agenda-edit-alert-date-anchor"
                    style={anchorStyleFor("--agenda-edit-alert-date-anchor")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-black/25 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35"
                  >
                    <CalendarClock className="h-3.5 w-3.5 text-violet-200" />
                    {formatInputDateLabel(extractDatePart(editForm.alertAtLocal))}
                  </button>
                  <div
                    popover="auto"
                    id="agenda-edit-alert-date-popover"
                    className="dropdown mt-2 rounded-2xl border border-violet-300/20 bg-[#120d21] p-2 shadow-[0_22px_48px_rgba(7,4,16,0.62)]"
                    style={positionAnchorStyleFor("--agenda-edit-alert-date-anchor")}
                  >
                    <calendar-date
                      className="cally rounded-xl bg-[#120d21] text-violet-100"
                      value={extractDatePart(editForm.alertAtLocal)}
                      onChange={(event) => {
                        const target = event.currentTarget as HTMLElement & { value?: string };
                        const nextDate = String(target.value || "").trim();
                        if (!nextDate) return;
                        setEditForm((prev) => ({ ...prev, alertAtLocal: mergeDateWithLocalTime(prev.alertAtLocal, nextDate) }));
                      }}
                    >
                      <svg
                        aria-label="Anterior"
                        className="size-4 fill-current text-violet-100"
                        slot="previous"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
                      </svg>
                      <svg
                        aria-label="Proximo"
                        className="size-4 fill-current text-violet-100"
                        slot="next"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                      >
                        <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
                      </svg>
                      <calendar-month></calendar-month>
                    </calendar-date>
                  </div>
                </div>
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

      {dashboardPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030f]/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-blue-300/30 bg-[linear-gradient(160deg,rgba(19,31,56,0.96),rgba(10,16,34,0.95))] p-5 shadow-[0_28px_70px_rgba(25,67,152,0.45)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-extrabold text-white">Adicionar a dashboard</h3>
                <p className="mt-1 text-sm text-blue-100/75">
                  Marque os compromissos que devem aparecer no relogio do topo da dashboard.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-blue-300/30 p-2 text-blue-100 transition hover:bg-blue-500/20"
                onClick={closeDashboardPicker}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {!sortedEvents.length ? (
                <p className="rounded-xl border border-blue-300/20 bg-black/25 px-4 py-5 text-sm text-slate-300">
                  Nenhum compromisso cadastrado ainda.
                </p>
              ) : (
                sortedEvents.map((row) => {
                  const checked = dashboardDraftEventIds.includes(row.id);
                  const status = getStatus(row);
                  return (
                    <label
                      key={row.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                        checked
                          ? "border-blue-300/45 bg-blue-500/15"
                          : "border-white/10 bg-black/20 hover:border-blue-300/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDashboardDraftEvent(row.id)}
                        className="mt-1 size-4 accent-blue-400"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{row.title}</p>
                        <p className="mt-0.5 text-xs text-slate-300">
                          Evento: {formatDateTime(row.event_at)} | Alerta: {formatDateTime(row.alert_at)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-blue-100/75">
                Selecionados: {dashboardDraftEventIds.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-blue-300/30 bg-blue-950/40 px-4 py-2 text-sm font-semibold text-blue-100 hover:bg-blue-900/40"
                  onClick={closeDashboardPicker}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] transition hover:brightness-110"
                  onClick={handleSaveDashboardSelection}
                >
                  Salvar selecao
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
