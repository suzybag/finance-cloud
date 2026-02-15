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
  { terms: ["casa", "moradia", "aluguel", "condominio", "energia", "luz", "agua"], visual: { iconName: "Home", iconColor: "#3b82f6" } },
  { terms: ["supermercado", "mercado", "feira", "compras"], visual: { iconName: "ShoppingCart", iconColor: "#ef4444" } },
  { terms: ["alimentacao", "restaurante", "ifood", "delivery", "lanche", "padaria"], visual: { iconName: "UtensilsCrossed", iconColor: "#f97316" } },
  { terms: ["transporte", "uber", "combustivel", "gasolina", "estacionamento", "pedagio"], visual: { iconName: "Car", iconColor: "#8b5cf6" } },
  { terms: ["saude", "farmacia", "medico", "hospital"], visual: { iconName: "HeartPulse", iconColor: "#ec4899" } },
  { terms: ["educacao", "curso", "faculdade", "escola"], visual: { iconName: "GraduationCap", iconColor: "#0ea5e9" } },
  { terms: ["lazer", "cinema", "show", "viagem"], visual: { iconName: "Clapperboard", iconColor: "#a855f7" } },
  { terms: ["invest", "acao", "fii", "cripto", "bitcoin", "cdb", "tesouro"], visual: { iconName: "PiggyBank", iconColor: "#10b981" } },
  { terms: ["cartao", "fatura", "credito"], visual: { iconName: "CreditCard", iconColor: "#6366f1" } },
  { terms: ["pix", "transferencia", "ted", "doc"], visual: { iconName: "Repeat", iconColor: "#06b6d4" } },
  { terms: ["salario", "receita", "bonus"], visual: { iconName: "CircleDollarSign", iconColor: "#22c55e" } },
  { terms: ["assinatura", "netflix", "spotify", "prime", "hbo"], visual: { iconName: "Receipt", iconColor: "#f43f5e" } },
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
