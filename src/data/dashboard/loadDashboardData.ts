import { supabase } from "@/lib/supabaseClient";
import type { Account, Transaction } from "@/lib/finance";

type DashboardDataResult = {
  data: { accounts: Account[]; transactions: Transaction[] } | null;
  error: string | null;
};

const toFriendlyDbError = (raw?: string) => {
  const msg = raw || "";
  const lower = msg.toLowerCase();

  if (lower.includes("schema cache") || lower.includes("could not find the table")) {
    return "Banco nao inicializado no Supabase. Rode o arquivo supabase.sql.";
  }

  if (lower.includes("permission") || lower.includes("rls")) {
    return "Sem permissao para ler os dados. Verifique as policies.";
  }

  return msg || "Falha ao carregar dados.";
};

export const loadDashboardData = async (): Promise<DashboardDataResult> => {
  const [accountsRes, transactionsRes] = await Promise.all([
    supabase.from("accounts").select("*").order("created_at"),
    supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(1000),
  ]);

  if (accountsRes.error || transactionsRes.error) {
    return {
      data: null,
      error: toFriendlyDbError(accountsRes.error?.message || transactionsRes.error?.message),
    };
  }

  return {
    data: {
      accounts: (accountsRes.data as Account[]) ?? [],
      transactions: (transactionsRes.data as Transaction[]) ?? [],
    },
    error: null,
  };
};

