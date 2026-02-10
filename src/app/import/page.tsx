"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { Account } from "@/lib/finance";
import { toNumber } from "@/lib/money";

const ULTRA_INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20";

const guessColumn = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("data")) return "occurred_at";
  if (normalized.includes("descricao") || normalized.includes("historico")) return "description";
  if (normalized.includes("valor") || normalized.includes("amount")) return "amount";
  if (normalized.includes("categoria")) return "category";
  if (normalized.includes("conta")) return "account";
  if (normalized.includes("tipo")) return "type";
  return "";
};

const parseDate = (value: string) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
};

export default function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultAccount, setDefaultAccount] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("accounts")
      .select("*")
      .order("created_at")
      .then(({ data }) => setAccounts((data as Account[]) || []));
  }, []);

  const previewRows = useMemo(() => rows.slice(0, 6), [rows]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return;
    const delimiter = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const parsedHeaders = lines[0].split(delimiter).map((h) => h.trim());
    const parsedRows = lines.slice(1).map((line) => line.split(delimiter).map((c) => c.trim()));
    setHeaders(parsedHeaders);
    setRows(parsedRows);

    const initialMap: Record<string, string> = {};
    parsedHeaders.forEach((h) => {
      const guess = guessColumn(h);
      if (guess) initialMap[h] = guess;
    });
    setMapping(initialMap);
  };

  const handleImport = async () => {
    setLoading(true);
    setMessage(null);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      setMessage("Usuario nao autenticado.");
      return;
    }

    const columnToField = (header: string) => mapping[header];
    const indexFor = (field: string) => headers.findIndex((h) => columnToField(h) === field);

    const dateIndex = indexFor("occurred_at");
    const descIndex = indexFor("description");
    const amountIndex = indexFor("amount");
    const categoryIndex = indexFor("category");
    const accountIndex = indexFor("account");
    const typeIndex = indexFor("type");

    if (dateIndex < 0 || descIndex < 0 || amountIndex < 0) {
      setLoading(false);
      setMessage("Mapeie pelo menos data, descricao e valor.");
      return;
    }

    const accountMap = new Map(accounts.map((acc) => [acc.name.toLowerCase(), acc.id]));

    const parsed = rows
      .map((row) => {
        const rawAmount = row[amountIndex];
        const amount = toNumber(rawAmount);
        const rawType = typeIndex >= 0 ? row[typeIndex]?.toLowerCase() : "";
        const type =
          rawType.includes("receita") || rawType.includes("entrada") || amount > 0
            ? "income"
            : rawType.includes("transfer")
            ? "transfer"
            : "expense";

        const accountName = accountIndex >= 0 ? row[accountIndex]?.toLowerCase() : "";
        const accountId = accountMap.get(accountName) ?? (defaultAccount || null);

        return {
          user_id: userId,
          occurred_at: parseDate(row[dateIndex]),
          description: row[descIndex],
          amount: Math.abs(amount),
          category: categoryIndex >= 0 ? row[categoryIndex] || null : null,
          type,
          account_id: accountId,
        };
      })
      .filter((row) => row.occurred_at && row.description);

    const { data: existing } = await supabase
      .from("transactions")
      .select("occurred_at, description, amount, account_id, type")
      .order("occurred_at", { ascending: false })
      .limit(500);

    const existingSet = new Set(
      (existing || []).map(
        (tx) => `${tx.occurred_at}-${tx.description}-${tx.amount}-${tx.account_id}-${tx.type}`,
      ),
    );

    const toInsert = parsed.filter(
      (tx) =>
        !existingSet.has(
          `${tx.occurred_at}-${tx.description}-${tx.amount}-${tx.account_id}-${tx.type}`,
        ),
    );

    if (!toInsert.length) {
      setLoading(false);
      setMessage("Nenhuma transacao nova para importar.");
      return;
    }

    const { error } = await supabase.from("transactions").insert(toInsert);
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Importadas ${toInsert.length} transacoes.`);
    }
    setLoading(false);
  };

  return (
    <AppShell title="Importacao" subtitle="Envie extratos CSV para importar">
      <div className="flex flex-col gap-8">
        <section className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Upload CSV</h2>
          <input
            type="file"
            accept=".csv"
            className="mt-4 w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />
          {fileName && (
            <p className="mt-2 text-xs text-slate-400">Arquivo: {fileName}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            OFX fica para fase 2. PDF exige OCR.
          </p>
        </section>

        {headers.length > 0 && (
          <section className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold">Mapeamento</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {headers.map((header) => (
                <div key={header}>
                  <p className="text-xs text-slate-400">{header}</p>
                  <select
                    className={ULTRA_INPUT_CLASS}
                    value={mapping[header] || ""}
                    onChange={(event) =>
                      setMapping((prev) => ({ ...prev, [header]: event.target.value }))
                    }
                  >
                    <option value="">Ignorar</option>
                    <option value="occurred_at">Data</option>
                    <option value="description">Descricao</option>
                    <option value="amount">Valor</option>
                    <option value="category">Categoria</option>
                    <option value="account">Conta</option>
                    <option value="type">Tipo</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-xs text-slate-400">Conta padrao</label>
              <select
                className="mt-2 w-full rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20"
                value={defaultAccount}
                onChange={(event) => setDefaultAccount(event.target.value)}
              >
                <option value="">Selecionar</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">Preview</h3>
              <div className="mt-2 space-y-2 text-xs text-slate-400">
                {previewRows.map((row, index) => (
                  <div key={`${row[0]}-${index}`}>{row.join(" | ")}</div>
                ))}
              </div>
            </div>

            <button
              className="mt-6 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.35)] transition hover:brightness-110 disabled:opacity-60"
              onClick={handleImport}
              disabled={loading}
            >
              {loading ? "Importando..." : "Importar transacoes"}
            </button>

            {message && (
              <div className="mt-4 rounded-xl border border-violet-300/20 bg-violet-950/35 px-4 py-3 text-sm text-violet-100">
                {message}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
