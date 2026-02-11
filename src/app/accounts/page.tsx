"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AccountCard } from "@/components/AccountCard";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import { Account, Transaction, computeAccountBalances } from "@/lib/finance";

type TabType = "ativas" | "arquivadas";
type AccountModalMode = "rename" | "adjust";

const ULTRA_INPUT_CLASS =
  "rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const ULTRA_SOFT_BTN_CLASS =
  "rounded-xl border border-violet-300/20 bg-violet-950/35 px-3 py-2 text-xs text-violet-100 hover:bg-violet-900/35 transition";

export default function AccountsPage() {
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

  const loadData = async () => {
    setLoading(true);
    const [accountsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(800),
    ]);

    if (accountsRes.error || txRes.error) {
      setFeedback(accountsRes.error?.message || txRes.error?.message || "Falha ao carregar dados.");
      setLoading(false);
      return;
    }

    setAccounts((accountsRes.data as Account[]) || []);
    setTransactions((txRes.data as Transaction[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    loadData();
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
    if (!userId || !name) return;
    setFeedback(null);
    const { error } = await supabase.from("accounts").insert({
      user_id: userId,
      name,
      institution,
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
    loadData();
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
    if (!modalAccount || !modalName.trim()) return;

    setModalSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("accounts")
      .update({ name: modalName.trim(), institution: modalInstitution.trim() || null })
      .eq("id", modalAccount.id);

    if (error) {
      setModalSaving(false);
      setFeedback(`Nao foi possivel editar a conta: ${error.message}`);
      return;
    }

    closeModal();
    setFeedback("Conta atualizada com sucesso.");
    loadData();
  };

  const handleArchive = async (account: Account) => {
    setFeedback(null);
    const { error } = await supabase
      .from("accounts")
      .update({ archived: !account.archived })
      .eq("id", account.id);
    if (error) {
      setFeedback(`Nao foi possivel arquivar a conta: ${error.message}`);
      return;
    }
    setFeedback(account.archived ? "Conta desarquivada." : "Conta arquivada.");
    loadData();
  };

  const handleDelete = async (account: Account) => {
    setFeedback(null);
    const ok = window.confirm(
      `Excluir a conta "${account.name}"? As transacoes vao ficar sem conta vinculada.`,
    );
    if (!ok) return;

    const { error } = await supabase.from("accounts").delete().eq("id", account.id);
    if (error) {
      setFeedback(`Nao foi possivel excluir a conta: ${error.message}`);
      return;
    }

    if (transferFrom === account.id) setTransferFrom("");
    if (transferTo === account.id) setTransferTo("");
    setFeedback("Conta excluida com sucesso.");
    loadData();
  };

  const handleSaveAdjust = async () => {
    if (!userId || !modalAccount) return;

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
      user_id: userId,
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
    loadData();
  };

  const handleTransfer = async () => {
    if (!userId || !transferFrom || !transferTo || transferFrom === transferTo) return;
    setFeedback(null);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
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
    loadData();
  };

  const openExtractStub = (account: Account) => {
    window.alert(`Extrato da conta ${account.name} (CSV/OFX) em breve.`);
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
              className="mt-4 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] hover:brightness-110 transition"
              onClick={handleCreate}
            >
              Criar conta
            </button>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="mb-4 flex gap-2">
              <button
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
                    onRefresh={loadData}
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
              <div className="mt-5 text-sm text-slate-500">Nenhuma conta nesta aba.</div>
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

