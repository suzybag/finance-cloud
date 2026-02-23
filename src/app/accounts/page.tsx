"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AccountCard } from "@/components/AccountCard";
import { useConfirmDialog } from "@/context/ConfirmDialogContext";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import {
  Account,
  Transaction,
  computeAccountBalances,
} from "@/lib/finance";

type TabType = "ativas" | "arquivadas";
type AccountModalMode = "rename" | "adjust";

const ULTRA_INPUT_CLASS =
  "rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const ULTRA_SOFT_BTN_CLASS =
  "rounded-xl border border-violet-300/20 bg-violet-950/35 px-3 py-2 text-xs text-violet-100 hover:bg-violet-900/35 transition";

const downloadTextFile = (filename: string, content: string, mime = "text/plain;charset=utf-8") => {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

const escapeCsvCell = (value: string | number) => {
  const raw = String(value ?? "");
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
};

const formatTxDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
};

const computeAccountTxSignedAmount = (accountId: string, tx: Transaction) => {
  const amount = toNumber(tx.amount);
  if (tx.type === "income" && tx.account_id === accountId) return amount;
  if ((tx.type === "expense" || tx.type === "card_payment") && tx.account_id === accountId) return -amount;
  if (tx.type === "adjustment" && tx.account_id === accountId) return amount;
  if (tx.type === "transfer") {
    if (tx.account_id === accountId) return -amount;
    if (tx.to_account_id === accountId) return amount;
  }
  return 0;
};

export default function AccountsPage() {
  const confirmDialog = useConfirmDialog();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [tab, setTab] = useState<TabType>("ativas");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const [modalMode, setModalMode] = useState<AccountModalMode | null>(null);
  const [modalAccount, setModalAccount] = useState<Account | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalInstitution, setModalInstitution] = useState("");
  const [modalTargetBalance, setModalTargetBalance] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

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

    const resolvedUserId = data.user?.id ?? null;
    setUserId(resolvedUserId);
    if (!resolvedUserId) {
      setFeedback("Sessao nao carregada. Entre novamente.");
      return null;
    }

    return resolvedUserId;
  };

  const loadData = async (resolvedUserId?: string | null) => {
    try {
      setLoading(true);
      const effectiveUserId = resolvedUserId || (await ensureUserId());
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const [accountsRes, txRes] = await Promise.all([
        supabase
          .from("accounts")
          .select("*")
          .eq("user_id", effectiveUserId)
          .order("created_at"),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", effectiveUserId)
          .order("occurred_at", { ascending: false })
          .limit(800),
      ]);

      if (accountsRes.error || txRes.error) {
        setFeedback(
          accountsRes.error?.message
            || txRes.error?.message
            || "Falha ao carregar dados.",
        );
        setLoading(false);
        return;
      }

      setAccounts((accountsRes.data as Account[]) || []);
      setTransactions((txRes.data as Transaction[]) || []);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setFeedback(`Falha inesperada ao carregar contas: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  useEffect(() => {
    void (async () => {
      const resolvedUserId = await ensureUserId();
      await loadData(resolvedUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter((acc) => (tab === "ativas" ? !acc.archived : acc.archived)),
    [accounts, tab],
  );

  const defaultAccountId = useMemo(
    () => accounts.find((acc) => !acc.archived)?.id ?? null,
    [accounts],
  );

  const handleCreate = async () => {
    try {
      if (!name.trim()) {
        setFeedback("Informe o nome da conta.");
        return;
      }

      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setFeedback(null);
      const { error } = await supabase.from("accounts").insert({
        user_id: resolvedUserId,
        name: name.trim(),
        institution: institution.trim() || null,
        opening_balance: toNumber(openingBalance),
        currency: "BRL",
      });
      if (error) {
        setFeedback(`Nao foi possivel criar a conta: ${error.message}`);
        return;
      }
      setName("");
      setInstitution("");
      setOpeningBalance("");
      setFeedback("Conta criada com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao criar conta: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setModalAccount(null);
    setModalName("");
    setModalInstitution("");
    setModalTargetBalance("");
    setModalSaving(false);
  };

  const openRenameModal = (account: Account) => {
    setModalMode("rename");
    setModalAccount(account);
    setModalName(account.name);
    setModalInstitution(account.institution ?? "");
    setModalTargetBalance("");
    setModalSaving(false);
  };

  const openAdjustModal = (account: Account) => {
    const currentBalance = balances.get(account.id) ?? 0;
    setModalMode("adjust");
    setModalAccount(account);
    setModalName("");
    setModalInstitution("");
    setModalTargetBalance(String(currentBalance));
    setModalSaving(false);
  };

  const handleSaveRename = async () => {
    try {
      if (!modalAccount || !modalName.trim()) return;
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setModalSaving(true);
      setFeedback(null);
      const { data, error } = await supabase
        .from("accounts")
        .update({ name: modalName.trim(), institution: modalInstitution.trim() || null })
        .eq("id", modalAccount.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();

      if (error) {
        setModalSaving(false);
        setFeedback(`Nao foi possivel editar a conta: ${error.message}`);
        return;
      }

      if (!data) {
        setModalSaving(false);
        setFeedback("Conta nao encontrada para edicao.");
        return;
      }

      closeModal();
      setFeedback("Conta atualizada com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setModalSaving(false);
      setFeedback(`Falha inesperada ao editar conta: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleArchive = async (account: Account) => {
    try {
      setFeedback(null);
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const { data, error } = await supabase
        .from("accounts")
        .update({ archived: !account.archived })
        .eq("id", account.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      if (error) {
        setFeedback(`Nao foi possivel arquivar a conta: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Conta nao encontrada para arquivar.");
        return;
      }
      setFeedback(account.archived ? "Conta desarquivada." : "Conta arquivada.");
      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao arquivar conta: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleDelete = async (account: Account) => {
    try {
      setFeedback(null);
      const ok = await confirmDialog({
        title: "Excluir conta?",
        description: `A conta "${account.name}" sera removida e as transacoes ficarao sem conta vinculada.`,
        confirmLabel: "Excluir",
        cancelLabel: "Cancelar",
        tone: "danger",
      });
      if (!ok) return;

      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const { data, error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", account.id)
        .eq("user_id", resolvedUserId)
        .select("id")
        .maybeSingle();
      if (error) {
        setFeedback(`Nao foi possivel excluir a conta: ${error.message}`);
        return;
      }
      if (!data) {
        setFeedback("Conta nao encontrada para exclusao.");
        return;
      }

      if (transferFrom === account.id) setTransferFrom("");
      if (transferTo === account.id) setTransferTo("");
      setFeedback("Conta excluida com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao excluir conta: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleSaveAdjust = async () => {
    try {
      if (!modalAccount) return;
      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      const currentBalance = balances.get(modalAccount.id) ?? 0;
      const target = toNumber(modalTargetBalance);
      const delta = target - currentBalance;

      if (!Number.isFinite(delta)) {
        setFeedback("Informe um saldo valido.");
        return;
      }

      if (Math.abs(delta) < 0.01) {
        closeModal();
        setFeedback("Saldo ja esta atualizado.");
        return;
      }

      setModalSaving(true);
      setFeedback(null);
      const { error } = await supabase.from("transactions").insert({
        user_id: resolvedUserId,
        type: "adjustment",
        description: `Ajuste de saldo - ${modalAccount.name}`,
        category: "Ajuste",
        amount: delta,
        account_id: modalAccount.id,
        occurred_at: new Date().toISOString().slice(0, 10),
      });

      if (error) {
        setModalSaving(false);
        setFeedback(`Nao foi possivel ajustar saldo: ${error.message}`);
        return;
      }

      closeModal();
      setFeedback("Saldo ajustado com sucesso.");
      await loadData(resolvedUserId);
    } catch (error) {
      setModalSaving(false);
      setFeedback(`Falha inesperada ao ajustar saldo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const handleTransfer = async () => {
    try {
      if (!transferFrom || !transferTo || transferFrom === transferTo) {
        setFeedback("Selecione contas diferentes para transferir.");
        return;
      }
      if (!transferAmount.trim()) {
        setFeedback("Informe o valor da transferencia.");
        return;
      }

      const resolvedUserId = await ensureUserId();
      if (!resolvedUserId) return;

      setFeedback(null);
      const { error } = await supabase.from("transactions").insert({
        user_id: resolvedUserId,
        type: "transfer",
        description: "Transferencia entre contas",
        category: "Transferencia",
        amount: toNumber(transferAmount),
        account_id: transferFrom,
        to_account_id: transferTo,
        occurred_at: new Date().toISOString().slice(0, 10),
      });
      if (error) {
        setFeedback(`Nao foi possivel transferir: ${error.message}`);
        return;
      }
      setTransferAmount("");
      setFeedback("Transferencia registrada.");
      await loadData(resolvedUserId);
    } catch (error) {
      setFeedback(`Falha inesperada ao transferir: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const openExtractStub = (account: Account) => {
    try {
      const accountTxs = transactions
        .filter((tx) => tx.account_id === account.id || tx.to_account_id === account.id)
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

      const csvRows = [
        [
          "data",
          "descricao",
          "categoria",
          "tipo",
          "valor",
          "conta_origem",
          "conta_destino",
        ],
        ...accountTxs.map((tx) => [
          formatTxDate(tx.occurred_at),
          tx.description || "",
          tx.category || "",
          tx.type,
          computeAccountTxSignedAmount(account.id, tx).toFixed(2).replace(".", ","),
          tx.account_id || "",
          tx.to_account_id || "",
        ]),
      ];

      const csvContent = csvRows
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(";"))
        .join("\n");

      const baseName = account.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const datePart = new Date().toISOString().slice(0, 10);
      const filename = `extrato_${baseName || "conta"}_${datePart}.csv`;

      downloadTextFile(filename, csvContent, "text/csv;charset=utf-8");
      setFeedback(`Extrato exportado: ${filename}`);
    } catch (error) {
      setFeedback(`Nao foi possivel exportar extrato: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  return (
    <AppShell title="Contas" subtitle="Saldo de cada conta bancaria e acoes rapidas">
      {loading ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-slate-300">
          Carregando...
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {feedback ? (
            <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100">
              {feedback}
            </div>
          ) : null}

          {modalMode && modalAccount ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06040dcc]/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-violet-300/20 bg-[linear-gradient(170deg,rgba(31,17,56,0.96),rgba(14,10,31,0.97))] p-5 shadow-[0_20px_60px_rgba(76,29,149,0.45)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold tracking-tight text-violet-100">
                    {modalMode === "rename" ? "Editar conta" : "Ajustar saldo"}
                  </h3>
                  <button
                    type="button"
                    className="rounded-lg border border-violet-300/20 px-2 py-1 text-sm text-violet-100 hover:bg-violet-500/15"
                    onClick={closeModal}
                    disabled={modalSaving}
                  >
                    X
                  </button>
                </div>

                {modalMode === "rename" ? (
                  <div className="mt-4 grid gap-3">
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Nome da conta</p>
                      <input
                        className={`${ULTRA_INPUT_CLASS} w-full`}
                        value={modalName}
                        onChange={(event) => setModalName(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Banco / Instituicao</p>
                      <input
                        className={`${ULTRA_INPUT_CLASS} w-full`}
                        value={modalInstitution}
                        onChange={(event) => setModalInstitution(event.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-950/65 p-3 text-sm text-slate-300">
                      <p>Conta: <span className="font-semibold text-slate-100">{modalAccount.name}</span></p>
                      <p className="mt-1">
                        Saldo atual:{" "}
                        <span className="font-semibold text-emerald-300">
                          {brl(balances.get(modalAccount.id) ?? 0)}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-semibold text-violet-100">Novo saldo</p>
                      <input
                        className={`${ULTRA_INPUT_CLASS} w-full`}
                        placeholder="Ex: 1500,00"
                        value={modalTargetBalance}
                        onChange={(event) => setModalTargetBalance(event.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={`${ULTRA_SOFT_BTN_CLASS} px-4 py-2 text-sm`}
                    onClick={closeModal}
                    disabled={modalSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] transition hover:brightness-110 disabled:opacity-60"
                    onClick={modalMode === "rename" ? handleSaveRename : handleSaveAdjust}
                    disabled={modalSaving || (modalMode === "rename" && !modalName.trim())}
                  >
                    {modalSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Nova conta</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                className={ULTRA_INPUT_CLASS}
                placeholder="Nome da conta"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className={ULTRA_INPUT_CLASS}
                placeholder="Banco / Instituicao"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
              />
              <input
                className={ULTRA_INPUT_CLASS}
                placeholder="Saldo inicial"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] hover:brightness-110 transition"
              onClick={handleCreate}
            >
              Criar conta
            </button>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  tab === "ativas"
                    ? "border-violet-300/60 bg-violet-500/25 text-violet-100"
                    : "border-violet-300/20 bg-violet-950/35 text-violet-100/75"
                }`}
                onClick={() => setTab("ativas")}
              >
                Ativas
              </button>
              <button
                type="button"
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  tab === "arquivadas"
                    ? "border-violet-300/60 bg-violet-500/25 text-violet-100"
                    : "border-violet-300/20 bg-violet-950/35 text-violet-100/75"
                }`}
                onClick={() => setTab("arquivadas")}
              >
                Arquivadas
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {visibleAccounts.map((account) => {
                const balance = balances.get(account.id) ?? 0;
                const isDefault = defaultAccountId === account.id;
                const bankLabel = account.institution?.trim() || account.name;

                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    balance={balance}
                    isDefault={isDefault}
                    bankLabel={bankLabel}
                    softButtonClassName={ULTRA_SOFT_BTN_CLASS}
                    onRefresh={() => {
                      void loadData();
                    }}
                    onOpenExtract={openExtractStub}
                    onOpenAdjust={openAdjustModal}
                    onPrepareTransfer={(selectedAccount) => {
                      setTransferFrom(selectedAccount.id);
                      setTimeout(() => {
                        document
                          .getElementById("area-transferencia")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }, 20);
                    }}
                    onOpenRename={openRenameModal}
                    onToggleArchive={handleArchive}
                    onDelete={handleDelete}
                  />
                );
              })}
            </div>

            {!visibleAccounts.length && (
              <div className="mt-5 text-sm text-slate-500">
                Nenhuma conta nesta aba.
                <span className="ml-2 text-bg-primary">Crie uma para organizar seus saldos.</span>
              </div>
            )}
          </section>

          <section id="area-transferencia" className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Transferir entre contas</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                className={ULTRA_INPUT_CLASS}
                value={transferFrom}
                onChange={(event) => setTransferFrom(event.target.value)}
              >
                <option value="">Conta origem</option>
                {accounts
                  .filter((acc) => !acc.archived)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>

              <select
                className={ULTRA_INPUT_CLASS}
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
              >
                <option value="">Conta destino</option>
                {accounts
                  .filter((acc) => !acc.archived)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>

              <input
                className={ULTRA_INPUT_CLASS}
                placeholder="Valor"
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] hover:brightness-110 transition"
              onClick={handleTransfer}
            >
              Confirmar transferencia
            </button>
          </section>
        </div>
      )}
    </AppShell>
  );
}

