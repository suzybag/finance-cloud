import { BankLogo } from "@/components/BankLogo";
import { PicPayCardVisual } from "@/components/PicPayCardVisual";
import { Account } from "@/lib/finance";
import { brl } from "@/lib/money";
import { resolveBankKey } from "@/lib/bankIcons";

type AccountCardProps = {
  account: Account;
  balance: number;
  cardTotal: number;
  isDefault: boolean;
  bankLabel: string;
  softButtonClassName: string;
  onRefresh: () => void;
  onOpenExtract: (account: Account) => void;
  onOpenAdjust: (account: Account) => void;
  onPrepareTransfer: (account: Account) => void;
  onOpenRename: (account: Account) => void;
  onToggleArchive: (account: Account) => void;
  onDelete: (account: Account) => void;
};

export function AccountCard({
  account,
  balance,
  cardTotal,
  isDefault,
  bankLabel,
  softButtonClassName,
  onRefresh,
  onOpenExtract,
  onOpenAdjust,
  onPrepareTransfer,
  onOpenRename,
  onToggleArchive,
  onDelete,
}: AccountCardProps) {
  const isPicPay = [account.institution, account.name, bankLabel].some(
    (value) => resolveBankKey(value) === "picpay",
  );

  return (
    <div className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(160deg,rgba(34,18,61,0.88),rgba(12,9,31,0.9))] p-5 shadow-[0_12px_35px_rgba(30,12,58,0.45)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xl font-bold text-white">{account.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <BankLogo bankName={bankLabel} size={30} />
            <p className="text-xs text-slate-400">{bankLabel}</p>
          </div>
        </div>
        <button className={softButtonClassName} onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      <div className="mt-4">
        {isPicPay ? (
          <PicPayCardVisual balance={balance} />
        ) : (
          <div className="rounded-xl border border-white/10 bg-slate-950/65 p-4">
            <p className="text-sm text-slate-400">Saldo atual</p>
            <p className="mt-1 text-3xl font-extrabold text-emerald-300">{brl(balance)}</p>
          </div>
        )}
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
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">
            Total do cartao
          </p>
          <p className="mt-1 text-base font-extrabold text-emerald-300">{brl(cardTotal)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <button className={softButtonClassName} onClick={() => onOpenExtract(account)}>
          Extrato
        </button>
        <button className={softButtonClassName} onClick={() => onOpenAdjust(account)}>
          Ajustar saldo
        </button>
        <button className={softButtonClassName} onClick={() => onPrepareTransfer(account)}>
          Transferir
        </button>
        <button className={softButtonClassName} onClick={() => onOpenRename(account)}>
          Editar
        </button>
        <button className={softButtonClassName} onClick={() => onToggleArchive(account)}>
          {account.archived ? "Desarquivar" : "Arquivar"}
        </button>
        <button
          className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/20 transition"
          onClick={() => onDelete(account)}
        >
          Excluir
        </button>
      </div>
    </div>
  );
}
