"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleMinus, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { brl, toNumber } from "@/lib/money";
import { sanitizeFreeText } from "@/lib/security/input";
import { supabase } from "@/lib/supabaseClient";

type ReceivableRow = {
  id: string;
  user_id: string;
  person_name: string;
  amount: number;
  due_date: string;
  description: string | null;
  is_received: boolean;
  created_at: string;
};

type AbatementHistoryItem = {
  id: string;
  amount: number;
  at: string;
  remaining_before: number;
  remaining_after: number;
};

const SECTION_CLASS =
  "rounded-2xl border border-violet-300/20 bg-[linear-gradient(165deg,rgba(31,18,56,0.94),rgba(12,10,30,0.95))] shadow-[0_16px_42px_rgba(22,10,48,0.55)] backdrop-blur-xl";

const INPUT_CLASS =
  "w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const PRIMARY_BTN_CLASS =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:opacity-60";

const SOFT_BTN_CLASS =
  "inline-flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-950/35 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-900/35 disabled:opacity-60";

const todayIso = () => new Date().toISOString().slice(0, 10);
const ABATEMENTS_MARKER = "__FC_ABATEMENTS__::";

const formatDateLabel = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTimeLabel = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseDescriptionWithHistory = (raw: string | null) => {
  const source = raw || "";
  const markerIndex = source.indexOf(ABATEMENTS_MARKER);
  if (markerIndex < 0) {
    return {
      description: source.trim() || null,
      abatements: [] as AbatementHistoryItem[],
    };
  }

  const visibleDescription = source.slice(0, markerIndex).trim();
  const historyRaw = source.slice(markerIndex + ABATEMENTS_MARKER.length).trim();

  try {
    const parsed = JSON.parse(historyRaw);
    if (!Array.isArray(parsed)) {
      return {
        description: visibleDescription || null,
        abatements: [] as AbatementHistoryItem[],
      };
    }

    const abatements = parsed
      .map((item) => ({
        id: String(item?.id || ""),
        amount: Math.abs(toNumber(item?.amount)),
        at: String(item?.at || ""),
        remaining_before: Math.abs(toNumber(item?.remaining_before)),
        remaining_after: Math.abs(toNumber(item?.remaining_after)),
      }))
      .filter((item) => item.id && item.amount > 0);

    return {
      description: visibleDescription || null,
      abatements,
    };
  } catch {
    return {
      description: visibleDescription || null,
      abatements: [] as AbatementHistoryItem[],
    };
  }
};

const buildDescriptionWithHistory = (
  visibleDescription: string | null,
  abatements: AbatementHistoryItem[],
) => {
  const cleanDescription = (visibleDescription || "").trim();
  if (!abatements.length) return cleanDescription || null;
  const payload = JSON.stringify(abatements);
  return cleanDescription
    ? `${cleanDescription} ${ABATEMENTS_MARKER}${payload}`
    : `${ABATEMENTS_MARKER}${payload}`;
};

export default function ReceberPage() {
  const confirmDialog = useConfirmDialog();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [abateTarget, setAbateTarget] = useState<ReceivableRow | null>(null);
  const [abateValue, setAbateValue] = useState("");
  const [abateError, setAbateError] = useState<string | null>(null);
  const [abating, setAbating] = useState(false);
  const [openReportRowId, setOpenReportRowId] = useState<string | null>(null);

  const ensureUserId = async () => {
    if (userId) return userId;

    const sessionRes = await supabase.auth.getSession();
    const fromSession = sessionRes.data.session?.user?.id ?? null;
    if (fromSession) {
      setUserId(fromSession);
      return fromSession;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setFeedback(`Nao foi possivel validar sessao: ${error.message}`);
      return null;
    }

    const resolved = data.user?.id ?? null;
    setUserId(resolved);
    if (!resolved) {
      setFeedback("Sessao nao carregada. Entre novamente.");
      return null;
    }
    return resolved;
  };

  const loadRows = async (resolvedUserId?: string | null) => {
    try {
      setLoading(true);
      const effectiveUserId = resolvedUserId || (await ensureUserId());
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("receivables")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("is_received", { ascending: true })
        .order("due_date", { ascending: true });

      if (error) {
        if (/relation .*receivables/i.test(error.message)) {
          setFeedback("Tabela receivables nao encontrada. Rode o supabase.sql atualizado.");
        } else {
          setFeedback(`Falha ao carregar recebimentos: ${error.message}`);
        }
        setLoading(false);
        return;
      }

      setRows((data as ReceivableRow[]) || []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setFeedback(`Falha inesperada ao carregar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  useEffect(() => {
    void (async () => {
      const resolvedUserId = await ensureUserId();
      await loadRows(resolvedUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingTotal = useMemo(
    () =>
      rows
        .filter((row) => !row.is_received)
        .reduce((sum, row) => sum + Math.abs(toNumber(row.amount)), 0),
    [rows],
  );

  const receivedTotal = useMemo(
    () =>
      rows
        .filter((row) => row.is_received)
        .reduce((sum, row) => sum + Math.abs(toNumber(row.amount)), 0),
    [rows],
  );

  const resetForm = () => {
    setPersonName("");
    setAmount("");
    setDueDate(todayIso());
    setDescription("");
  };

  const handleCreate = async () => {
    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    const cleanedName = sanitizeFreeText(personName, 80);
    const cleanedDescription = sanitizeFreeText(description, 500);
    const parsedAmount = Math.abs(toNumber(amount));

    if (!cleanedName) {
      setFeedback("Informe o nome da pessoa.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFeedback("Informe um valor valido maior que zero.");
      return;
    }
    if (!dueDate) {
      setFeedback("Informe a data.");
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);

      const { error } = await supabase.from("receivables").insert({
        user_id: resolvedUserId,
        person_name: cleanedName,
        amount: parsedAmount,
        due_date: dueDate,
        description: cleanedDescription || null,
        is_received: false,
      });

      if (error) {
        setSaving(false);
        setFeedback(`Nao foi possivel adicionar: ${error.message}`);
        return;
      }

      setSaving(false);
      setShowForm(false);
      resetForm();
      setFeedback("Registro de recebimento adicionado.");
      await loadRows(resolvedUserId);
    } catch (error) {
      setSaving(false);
      setFeedback(`Falha inesperada ao adicionar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleToggleReceived = async (row: ReceivableRow) => {
    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    try {
      setBusyId(row.id);
      setFeedback(null);
      const { data, error } = await supabase
        .from("receivables")
        .update({ is_received: !row.is_received })
        .eq("id", row.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      setBusyId(null);
      if (error) {
        setFeedback(`Nao foi possivel atualizar: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Registro nao encontrado.");
        return;
      }

      await loadRows(resolvedUserId);
    } catch (error) {
      setBusyId(null);
      setFeedback(`Falha inesperada ao atualizar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleDelete = async (row: ReceivableRow) => {
    const confirmed = await confirmDialog({
      title: "Excluir registro?",
      description: `O registro de ${row.person_name} sera removido permanentemente.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (!confirmed) return;

    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    try {
      setBusyId(row.id);
      setFeedback(null);
      const { data, error } = await supabase
        .from("receivables")
        .delete()
        .eq("id", row.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      setBusyId(null);
      if (error) {
        setFeedback(`Nao foi possivel excluir: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Registro nao encontrado para exclusao.");
        return;
      }

      await loadRows(resolvedUserId);
    } catch (error) {
      setBusyId(null);
      setFeedback(`Falha inesperada ao excluir: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const openAbatimento = (row: ReceivableRow) => {
    setAbateTarget(row);
    setAbateValue("");
    setAbateError(null);
  };

  const closeAbatimento = () => {
    setAbateTarget(null);
    setAbateValue("");
    setAbateError(null);
    setAbating(false);
  };

  const handleApplyAbatimento = async () => {
    if (!abateTarget) return;

    const resolvedUserId = await ensureUserId();
    if (!resolvedUserId) return;

    const currentAmount = Math.abs(toNumber(abateTarget.amount));
    const parsedDiscount = Math.abs(toNumber(abateValue));

    if (!Number.isFinite(parsedDiscount) || parsedDiscount <= 0) {
      setAbateError("Informe um valor valido maior que zero.");
      return;
    }
    if (parsedDiscount > currentAmount) {
      setAbateError("O valor abatido nao pode ser maior que o saldo.");
      return;
    }

    try {
      setAbating(true);
      setAbateError(null);
      setFeedback(null);

      const parsedHistory = parseDescriptionWithHistory(abateTarget.description);
      const nextAmount = Math.max(0, Number((currentAmount - parsedDiscount).toFixed(2)));
      const nextIsReceived = nextAmount === 0 ? true : abateTarget.is_received;
      const nextAbatements: AbatementHistoryItem[] = [
        ...parsedHistory.abatements,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          amount: parsedDiscount,
          at: new Date().toISOString(),
          remaining_before: currentAmount,
          remaining_after: nextAmount,
        },
      ];
      const nextDescription = buildDescriptionWithHistory(
        parsedHistory.description,
        nextAbatements,
      );

      const { data, error } = await supabase
        .from("receivables")
        .update({ amount: nextAmount, is_received: nextIsReceived, description: nextDescription })
        .eq("id", abateTarget.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      if (error) {
        setAbating(false);
        setAbateError(`Nao foi possivel abater: ${error.message}`);
        return;
      }
      if (!data) {
        setAbating(false);
        setAbateError("Registro nao encontrado.");
        return;
      }

      closeAbatimento();
      setFeedback(
        `Abatido ${brl(parsedDiscount)} de ${abateTarget.person_name}. Novo saldo: ${brl(nextAmount)}.`,
      );
      await loadRows(resolvedUserId);
    } catch (error) {
      setAbating(false);
      setAbateError(
        `Falha inesperada ao abater: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }
  };

  return (
    <AppShell
      title="Receber"
      subtitle="Anote o dinheiro que as pessoas estao te devendo"
      actions={(
        <button
          type="button"
          className={PRIMARY_BTN_CLASS}
          onClick={() => setShowForm((prev) => !prev)}
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Fechar" : "Adicionar"}
        </button>
      )}
    >
      <div className="space-y-5">
        {abateTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className={`${SECTION_CLASS} w-full max-w-md p-5`}>
              <h3 className="text-lg font-bold text-white">Abater saldo</h3>
              <p className="mt-1 text-sm text-violet-100/80">
                {abateTarget.person_name} - Saldo atual: {brl(Math.abs(toNumber(abateTarget.amount)))}
              </p>

              <div className="mt-4">
                <input
                  className={INPUT_CLASS}
                  placeholder="Ex: 30,00"
                  value={abateValue}
                  onChange={(event) => setAbateValue(event.target.value)}
                />
              </div>

              {abateError ? (
                <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                  {abateError}
                </div>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={SOFT_BTN_CLASS} onClick={closeAbatimento} disabled={abating}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={PRIMARY_BTN_CLASS}
                  onClick={() => void handleApplyAbatimento()}
                  disabled={abating}
                >
                  {abating ? "Aplicando..." : "Aplicar abatimento"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {feedback ? (
          <div className="rounded-xl border border-violet-300/30 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
            {feedback}
          </div>
        ) : null}

        <section className={`${SECTION_CLASS} p-5`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-violet-300/20 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-violet-200/70">Pendente</p>
              <p className="mt-1 text-2xl font-bold text-white">{brl(pendingTotal)}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-200">Recebido</p>
              <p className="mt-1 text-2xl font-bold text-emerald-100">{brl(receivedTotal)}</p>
            </div>
          </div>
        </section>

        {showForm ? (
          <section className={`${SECTION_CLASS} p-5`}>
            <h2 className="text-lg font-bold text-white">Novo registro</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className={INPUT_CLASS}
                placeholder="Nome"
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
              />
              <input
                className={INPUT_CLASS}
                placeholder="Valor"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <input
                className={INPUT_CLASS}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <input
                className={INPUT_CLASS}
                placeholder="Descricao"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                className={PRIMARY_BTN_CLASS}
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </section>
        ) : null}

        <section className={`${SECTION_CLASS} p-5`}>
          <h2 className="text-lg font-bold text-white">Lista de recebimentos</h2>
          {loading ? (
            <p className="mt-3 text-sm text-violet-100/80">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-violet-100/80">Nenhum registro ainda.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {rows.map((row) => {
                const parsed = parseDescriptionWithHistory(row.description);
                const totalAbatido = parsed.abatements.reduce(
                  (sum, item) => sum + Math.abs(toNumber(item.amount)),
                  0,
                );
                const hasAbatements = parsed.abatements.length > 0;
                const isReportOpen = openReportRowId === row.id;
                const abatementsDescending = [...parsed.abatements].reverse();

                return (
                  <article
                    key={row.id}
                    className={`rounded-xl border p-4 ${
                      row.is_received
                        ? "border-emerald-400/40 bg-emerald-500/10"
                        : "border-violet-300/20 bg-black/20"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="inline-flex rounded-full border border-violet-300/45 bg-gradient-to-r from-violet-600 via-indigo-500 to-violet-500 px-3.5 py-1.5 shadow-[0_10px_24px_rgba(109,40,217,0.45)]">
                          <p className="text-sm font-bold tracking-tight text-white sm:text-base">
                            {row.person_name}
                          </p>
                        </span>
                        <p className="text-xs text-violet-100/70">Data: {formatDateLabel(row.due_date)}</p>
                        {parsed.description ? (
                          <p className="mt-1 text-xs text-violet-100/80">{parsed.description}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="flex items-center gap-2">
                          {hasAbatements ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-violet-300/35 bg-violet-500/18 px-2 py-0.5 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/28"
                              title="Abrir relatorio de abatimentos"
                              onClick={() =>
                                setOpenReportRowId((prev) => (prev === row.id ? null : row.id))
                              }
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              {isReportOpen ? "Ocultar relatorio" : "Relatorio"}
                            </button>
                          ) : null}
                          <p className="text-base font-bold text-white">{brl(Math.abs(toNumber(row.amount)))}</p>
                        </div>
                        {hasAbatements && isReportOpen ? (
                          <div className="w-full rounded-lg border border-violet-300/25 bg-violet-500/10 px-2.5 py-2 text-[11px] text-violet-100/90 sm:w-[320px]">
                            <p className="font-semibold text-violet-100">Total abatido: {brl(totalAbatido)}</p>
                            <div className="mt-2 space-y-2">
                              {abatementsDescending.map((item, index) => (
                                <div
                                  key={item.id}
                                  className="rounded-md border border-violet-300/20 bg-black/20 px-2 py-1.5"
                                >
                                  <p className="font-semibold text-violet-100">
                                    {index + 1}. Abatido {brl(item.amount)}
                                  </p>
                                  <p className="text-violet-100/70">
                                    {formatDateTimeLabel(item.at)} | {brl(item.remaining_before)} -&gt;{" "}
                                    {brl(item.remaining_after)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                        {!row.is_received ? (
                          <button
                            type="button"
                            className={SOFT_BTN_CLASS}
                            onClick={() => openAbatimento(row)}
                            disabled={busyId === row.id}
                          >
                            <CircleMinus className="h-3.5 w-3.5" />
                            Abater saldo
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={SOFT_BTN_CLASS}
                          onClick={() => void handleToggleReceived(row)}
                          disabled={busyId === row.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {row.is_received ? "Marcar pendente" : "Marcar recebido"}
                        </button>
                        <button
                          type="button"
                          className={SOFT_BTN_CLASS}
                          onClick={() => void handleDelete(row)}
                          disabled={busyId === row.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
