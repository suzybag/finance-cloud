export type CategoryVisual = {
  iconName: string;
  iconColor: string;
};

type CategoryRule = {
  terms: string[];
  visual: CategoryVisual;
};

const DEFAULT_CATEGORY_VISUAL: CategoryVisual = {
  iconName: "Tag",
  iconColor: "#64748b",
};

const CATEGORY_VISUAL_RULES: CategoryRule[] = [
  { terms: ["iphone", "smartphone", "celular", "android"], visual: { iconName: "IPhoneBadge", iconColor: "#60a5fa" } },
  { terms: ["renda fixa caixinha", "caixinha renda fixa", "caixinha investimento", "caixinha de investimento", "caixinha", "cofrinho"], visual: { iconName: "MoneySafe3D", iconColor: "#4ade80" } },
  { terms: ["planejamento casa", "meta casa", "objetivo casa propria", "casa propria"], visual: { iconName: "Home3D", iconColor: "#3b82f6" } },
  { terms: ["pix", "transferencia pix", "chave pix"], visual: { iconName: "PixLogo", iconColor: "#14b8a6" } },
  { terms: ["tesouro selic", "tesouro ipca", "tesouro"], visual: { iconName: "TesouroDiretoLogo", iconColor: "#1e3a8a" } },
  { terms: ["ouro", "commodities", "xau"], visual: { iconName: "GoldBars3D", iconColor: "#f59e0b" } },
  { terms: ["bitcoin", "btc", "cripto"], visual: { iconName: "BitcoinCoin3D", iconColor: "#f59e0b" } },
  { terms: ["netflix assinatura", "assinatura netflix", "netflix"], visual: { iconName: "NetflixLogo", iconColor: "#e11d48" } },
  { terms: ["hbo max sem assinatura", "htbo max", "hbo max", "hbomax", "hbo"], visual: { iconName: "HboMaxLogo", iconColor: "#4338ca" } },
  { terms: ["spotify", "deezer", "apple music", "musica"], visual: { iconName: "SpotifyLogo", iconColor: "#22c55e" } },
  { terms: ["disney", "disney+", "disney plus"], visual: { iconName: "DisneyLogo", iconColor: "#60a5fa" } },
  { terms: ["amazon", "prime"], visual: { iconName: "AmazonLogo", iconColor: "#38bdf8" } },
  { terms: ["prime video", "amazon prime"], visual: { iconName: "PrimeVideoLogo", iconColor: "#0ea5e9" } },
  { terms: ["chatgpt", "openai"], visual: { iconName: "OpenAiLogo", iconColor: "#334155" } },
  { terms: ["shopee"], visual: { iconName: "ShopeeLogo", iconColor: "#f97316" } },
  { terms: ["mercado livre", "mercadolivre"], visual: { iconName: "MercadoLivreLogo", iconColor: "#facc15" } },
  { terms: ["agenda", "planejamento", "checklist", "tarefa", "todo"], visual: { iconName: "Checklist3D", iconColor: "#6366f1" } },
  { terms: ["assinatura", "recorrente", "contrato"], visual: { iconName: "Contract3D", iconColor: "#8b5cf6" } },
  { terms: ["casa", "moradia", "aluguel", "condominio", "energia", "luz", "agua"], visual: { iconName: "Home3D", iconColor: "#3b82f6" } },
  { terms: ["imovel", "reforma", "lar"], visual: { iconName: "HomeRound3D", iconColor: "#2563eb" } },
  { terms: ["supermercado", "mercado", "feira", "compras"], visual: { iconName: "ShoppingCart", iconColor: "#ef4444" } },
  { terms: ["alimentacao", "restaurante", "ifood", "delivery", "lanche", "padaria"], visual: { iconName: "FoodCourt3D", iconColor: "#f97316" } },
  { terms: ["transporte", "uber", "combustivel", "gasolina", "estacionamento", "pedagio"], visual: { iconName: "Car", iconColor: "#8b5cf6" } },
  { terms: ["saude", "farmacia", "medico", "hospital"], visual: { iconName: "HeartPulse", iconColor: "#ec4899" } },
  { terms: ["educacao", "curso", "faculdade", "escola"], visual: { iconName: "GraduationCap", iconColor: "#0ea5e9" } },
  { terms: ["lazer", "cinema", "show", "viagem"], visual: { iconName: "Cinema3D", iconColor: "#a855f7" } },
  { terms: ["invest", "acao", "fii", "cdb"], visual: { iconName: "MarketGrowth3D", iconColor: "#10b981" } },
  { terms: ["cartao", "fatura", "credito"], visual: { iconName: "CreditCard", iconColor: "#6366f1" } },
  { terms: ["transferencia", "ted", "doc"], visual: { iconName: "Repeat", iconColor: "#06b6d4" } },
  { terms: ["salario", "receita", "bonus"], visual: { iconName: "CircleDollarSign", iconColor: "#22c55e" } },
];

export const normalizeCategoryKey = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const sanitizeIconName = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return null;
  return /^[A-Za-z][A-Za-z0-9]*$/.test(raw) ? raw : null;
};

export const sanitizeIconColor = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return null;

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return raw;
  if (/^rgba?\([^)]*\)$/.test(raw)) return raw;
  if (/^hsla?\([^)]*\)$/.test(raw)) return raw;
  if (/^var\(--[a-zA-Z0-9-_]+\)$/.test(raw)) return raw;
  if (/^[a-zA-Z]+$/.test(raw)) return raw;

  return null;
};

const guessCategoryVisual = (categoryName?: string | null) => {
  const normalized = normalizeCategoryKey(categoryName);
  if (!normalized) return DEFAULT_CATEGORY_VISUAL;

  const rule = CATEGORY_VISUAL_RULES.find((item) =>
    item.terms.some((term) => normalized.includes(term)),
  );
  if (rule) return rule.visual;

  return DEFAULT_CATEGORY_VISUAL;
};

export const resolveCategoryVisual = ({
  categoryName,
  iconName,
  iconColor,
}: {
  categoryName?: string | null;
  iconName?: string | null;
  iconColor?: string | null;
}): CategoryVisual => {
  const guessed = guessCategoryVisual(categoryName);
  return {
    iconName: sanitizeIconName(iconName) || guessed.iconName,
    iconColor: sanitizeIconColor(iconColor) || guessed.iconColor,
  };
};

export const getCategoryFallbackVisual = (categoryName?: string | null) =>
  guessCategoryVisual(categoryName);
