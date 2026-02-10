export const BANK_ICON_MAP = {
  inter: "/banks/inter.svg",
  nubank: "/banks/nubank.svg",
  bradesco: "/banks/bradesco.svg",
  mercadopago: "/banks/mercadopago.svg",
  xp: "/banks/xp.svg",
  btg: "/banks/btg.svg",
  picpay: "/banks/picpay.svg",
} as const;

type BankKey = keyof typeof BANK_ICON_MAP;

const BANK_ALIASES: Record<BankKey, string[]> = {
  inter: ["inter", "bancointer", "banco inter"],
  nubank: ["nubank", "nu", "nu bank", "roxinho", "ultravioleta"],
  bradesco: ["bradesco"],
  mercadopago: ["mercadopago", "mercado pago", "mercado-pago", "mp"],
  xp: ["xp", "xpinvestimentos", "xpinvest"],
  btg: ["btg", "btgpactual", "btg pactual"],
  picpay: ["picpay", "pic pay"],
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
