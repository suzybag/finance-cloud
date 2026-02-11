export const BANK_ICON_MAP = {
  inter: "/banks/inter.svg",
  nubank: "/banks/nubank.svg",
  nuinvest: "/banks/nuinvest.svg",
  bradesco: "/banks/bradesco.svg",
  mercadopago: "/banks/mercadopago.svg",
  xp: "/banks/xp.svg",
  btg: "/banks/btg.svg",
  picpay: "/banks/picpay.svg",
  santander: "/banks/santander.svg",
  caixa: "/banks/caixa.svg",
  bancodobrasil: "/banks/bancodobrasil.svg",
  wise: "/banks/wise.svg",
} as const;

type BankKey = keyof typeof BANK_ICON_MAP;

const BANK_ALIASES: Record<BankKey, string[]> = {
  inter: ["inter", "bancointer", "banco inter"],
  nubank: ["nubank", "nu", "nu bank", "roxinho", "ultravioleta"],
  nuinvest: ["nuinvest", "nu invest", "nuinvestimentos", "nu investimentos", "easynvest"],
  bradesco: ["bradesco"],
  mercadopago: ["mercadopago", "mercado pago", "mercado-pago", "mp"],
  xp: ["xp", "xpinvestimentos", "xp investimentos", "xpinvest"],
  btg: ["btg", "btgpactual", "btg pactual"],
  picpay: ["picpay", "pic pay"],
  santander: ["santander", "banco santander"],
  caixa: ["caixa", "caixaeconomicafederal", "caixa economica", "caixa economica federal"],
  bancodobrasil: ["bb", "bancodobrasil", "banco do brasil"],
  wise: ["wise", "transferwise", "transfer wise"],
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const resolveBankKey = (value?: string | null): BankKey | null => {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const normalized = normalizeText(raw);
  const source = `${normalized} ${raw.toLowerCase()}`;

  for (const [key, aliases] of Object.entries(BANK_ALIASES) as [BankKey, string[]][]) {
    if (aliases.some((alias) => source.includes(normalizeText(alias)))) {
      return key;
    }
  }

  return null;
};

export const getBankIconPath = (value?: string | null) => {
  const key = resolveBankKey(value);
  return key ? BANK_ICON_MAP[key] : null;
};

export const getBankIconPathFromValues = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const path = getBankIconPath(value);
    if (path) return path;
  }
  return null;
};
