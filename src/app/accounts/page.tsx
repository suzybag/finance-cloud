"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BankLogo } from "@/components/BankLogo";
import { supabase } from "@/lib/supabaseClient";
import { brl, toNumber } from "@/lib/money";
import { Account, Transaction, computeAccountBalances } from "@/lib/finance";

type TabType = "ativas" | "arquivadas";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [tab, setTab] = useState<TabType>("ativas");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [{ data: accountsData }, { data: txData }] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(800),
    ]);
    setAccounts((accountsData as Account[]) || []);
    setTransactions((txData as Transaction[]) || []);
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
    await supabase.from("accounts").insert({
      user_id: userId,
      name,
      institution,
      opening_balance: toNumber(openingBalance),
      currency: "BRL",
    });
    setName("");
    setInstitution("");
    setOpeningBalance("");
    loadData();
  };

  const handleRename = async (account: Account) => {
    const newName = window.prompt("Novo nome da conta", account.name);
    if (!newName) return;
    const newInstitution = window.prompt(
      "Banco/Instituicao",
      account.institution ?? "",
    );

    await supabase
      .from("accounts")
      .update({ name: newName, institution: newInstitution ?? null })
      .eq("id", account.id);
    loadData();
  };

  const handleArchive = async (account: Account) => {
    await supabase
      .from("accounts")
      .update({ archived: !account.archived })
      .eq("id", account.id);
    loadData();
  };

  const handleAdjust = async (account: Account) => {
    if (!userId) return;
    const currentBalance = balances.get(account.id) ?? 0;
    const targetInput = window.prompt(
      `Saldo atual: ${brl(currentBalance)}. Informe o novo saldo:`,
      String(currentBalance),
    );
    if (!targetInput) return;

    const target = toNumber(targetInput);
    const delta = target - currentBalance;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return;

    await supabase.from("transactions").insert({
      user_id: userId,
      type: "adjustment",
      description: `Ajuste de saldo - ${account.name}`,
      category: "Ajuste",
      amount: delta,
      account_id: account.id,
      occurred_at: new Date().toISOString().slice(0, 10),
    });

    loadData();
  };

  const handleTransfer = async () => {
    if (!userId || !transferFrom || !transferTo || transferFrom === transferTo) return;
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "transfer",
      description: "Transferencia entre contas",
      category: "Transferencia",
      amount: toNumber(transferAmount),
      account_id: transferFrom,
      to_account_id: transferTo,
      occurred_at: new Date().toISOString().slice(0, 10),
    });
    setTransferAmount("");
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
          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Nova conta</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Nome da conta"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Banco / Instituicao"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
              />
              <input
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Saldo inicial"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
            </div>
            <button
              className="mt-4 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
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
                    ? "border-sky-400 bg-sky-500/20 text-sky-200"
                    : "border-slate-700 bg-slate-900/60 text-slate-300"
                }`}
                onClick={() => setTab("ativas")}
              >
                Ativas
              </button>
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                  tab === "arquivadas"
                    ? "border-sky-400 bg-sky-500/20 text-sky-200"
                    : "border-slate-700 bg-slate-900/60 text-slate-300"
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

                return (
                  <div
                    key={account.id}
                    className="rounded-2xl border border-white/10 bg-[#1c1c1e] p-5 shadow-[0_10px_25px_rgba(0,0,0,0.22)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold text-white">{account.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <BankLogo bankName={account.institution} size={30} />
                          <p className="text-xs text-slate-400">
                            {account.institution ?? "Instituicao nao informada"}
                          </p>
                        </div>
                      </div>
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200"
                        onClick={() => loadData()}
                      >
                        Atualizar
                      </button>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/65 p-4">
                      <p className="text-sm text-slate-400">Saldo atual</p>
                      <p className="mt-1 text-3xl font-extrabold text-emerald-300">{brl(balance)}</p>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-sm text-slate-300">
                      <div className="font-semibold text-white">
                        {isDefault ? "Conta padrao" : "Conta nomeada"}
                      </div>
                      <div className="mt-1 text-slate-400">
                        {isDefault
                          ? "Ao lancar via WhatsApp sem informar conta, sera usada essa conta."
                          : "Ao lancar via WhatsApp informando essa conta, o registro cai nela."}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100"
                        onClick={() => openExtractStub(account)}
                      >
                        Extrato
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100"
                        onClick={() => handleAdjust(account)}
                      >
                        Ajustar saldo
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100"
                        onClick={() => {
                          setTransferFrom(account.id);
                          setTimeout(() => {
                            document
                              .getElementById("area-transferencia")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }, 20);
                        }}
                      >
                        Transferir
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100"
                        onClick={() => handleRename(account)}
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100"
                        onClick={() => handleArchive(account)}
                      >
                        {account.archived ? "Desarquivar" : "Arquivar"}
                      </button>
                    </div>
                  </div>
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
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
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
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
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
                className="rounded-xl border border-white/10 bg-[#1c1c1e] px-3 py-2 text-sm"
                placeholder="Valor"
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
              />
            </div>
            <button
              className="mt-4 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950"
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
