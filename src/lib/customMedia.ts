const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const CUSTOM_MEDIA_ASSETS = {
  goldBarsPhoto: "/custom/icons/10598498.jpg",
  hboMaxPoster: "/custom/icons/10875822.jpg",
  openAiLogo: "/custom/icons/11865338.png",
  pixSymbol3d: "/custom/icons/825540.png",
  agendaCheck3d: "/custom/icons/agenda-13753233.png",
  contractSigned3d: "/custom/icons/assinatura.png",
  goldBarsIcon: "/custom/icons/barras-de-ouro.png",
  bitcoinCircle: "/custom/icons/bitcoin.png",
  bitcoinCircleDark: "/custom/icons/bitcoin-1.png",
  bitcoinInHand: "/custom/icons/bitcoin-criptografado.png",
  bitcoinLogoDark: "/custom/icons/bitcoin-logo-bright-orange-color-600nw-2650281747.webp",
  moneySafe3d: "/custom/icons/caixa-para-economizar-dinheiro-3d-icon-png-download-5298710.webp",
  houseStar: "/custom/icons/casa-nova.png",
  marketGrowth: "/custom/icons/crescimento-de-mercado.png",
  netflixRound: "/icons/netflix-v2.png",
  homeOutline: "/custom/icons/fachada-de-casa-de-familia.png",
  shopeeDecor: "/custom/icons/icone-vendas-shopee-decorativo-marketplace-1491-3-2bc22aef0c13ed1c94c03c482de6997d.webp",
  iphoneImage: "/custom/icons/images.jfif",
  buildingRound: "/custom/icons/images-1.jfif",
  hboMaxSquare: "/icons/hbo-v2.png",
  primeVideo: "/custom/icons/images-2.png",
  homeGradient: "/custom/icons/lar.png",
  mercadoLivre: "/custom/icons/mercado-libre.png",
  pixLogo: "/custom/icons/pix-banco-central-logo-png-seeklogo-388843.png",
  forkKnife: "/custom/icons/planner-11984398.png",
  netflixRoundAlt: "/icons/netflix-v2.png",
  foodCourt: "/custom/icons/praca-de-alimentacao.png",
  tesouroDireto: "/custom/icons/tesouro-direto.png",
  cinemaPopcorn: "/custom/icons/tira-de-filme-e-comida-de-cinema.png",
  uberVideo: "/custom/icons/uber.mp4",
  shopeeBag: "/custom/icons/icone-vendas-shopee-decorativo-marketplace-1491-3-2bc22aef0c13ed1c94c03c482de6997d.webp",
  plannerBook: "/custom/icons/yearbook-9980809.png",
  spotifyCircle: "/icons/spotify.png",
  disneyCircle: "/icons/disney.png",
  amazonPrimeCircle: "/icons/amazon.png",
  defaultServiceIcon: "/icons/default.png",
} as const;

export type SubscriptionIconOption = {
  id: string;
  label: string;
  path: string;
};

export const SUBSCRIPTION_ICON_OPTIONS: SubscriptionIconOption[] = [
  { id: "default", label: "Padrao", path: "/icons/default.png" },
  { id: "netflix-v2", label: "Netflix", path: "/icons/netflix-v2.png" },
  { id: "hbo-v2", label: "HBO", path: "/icons/hbo-v2.png" },
  { id: "hbo-custom", label: "HBO Custom", path: "/custom/hbo-max.png" },
  { id: "spotify", label: "Spotify", path: "/icons/spotify.png" },
  { id: "disney", label: "Disney", path: "/icons/disney.png" },
  { id: "amazon", label: "Amazon", path: "/icons/amazon.png" },
  { id: "assinatura", label: "Contrato", path: "/custom/icons/assinatura.png" },
  { id: "agenda", label: "Agenda", path: "/custom/icons/agenda-13753233.png" },
  { id: "planner", label: "Planner", path: "/custom/icons/planner-11984398.png" },
  { id: "yearbook", label: "Caderno", path: "/custom/icons/yearbook-9980809.png" },
  { id: "food-court", label: "Comida", path: "/custom/icons/praca-de-alimentacao.png" },
  { id: "cinema", label: "Cinema", path: "/custom/icons/tira-de-filme-e-comida-de-cinema.png" },
  { id: "mercado-livre", label: "Mercado Livre", path: "/custom/icons/mercado-libre.png" },
  { id: "pix-logo", label: "PIX", path: "/custom/icons/pix-banco-central-logo-png-seeklogo-388843.png" },
  { id: "tesouro-direto", label: "Tesouro Direto", path: "/custom/icons/tesouro-direto.png" },
  { id: "gold-bars", label: "Ouro", path: "/custom/icons/barras-de-ouro.png" },
  { id: "bitcoin", label: "Bitcoin", path: "/custom/icons/bitcoin.png" },
  { id: "bitcoin-dark", label: "Bitcoin Dark", path: "/custom/icons/bitcoin-1.png" },
  { id: "bitcoin-hand", label: "Bitcoin Hand", path: "/custom/icons/bitcoin-criptografado.png" },
  { id: "bitcoin-logo", label: "Bitcoin Logo", path: "/custom/icons/bitcoin-logo-bright-orange-color-600nw-2650281747.webp" },
  { id: "safe", label: "Cofre", path: "/custom/icons/caixa-para-economizar-dinheiro-3d-icon-png-download-5298710.webp" },
  { id: "house-star", label: "Casa", path: "/custom/icons/casa-nova.png" },
  { id: "house-outline", label: "Casa Outline", path: "/custom/icons/fachada-de-casa-de-familia.png" },
  { id: "house-round", label: "Lar", path: "/custom/icons/lar.png" },
  { id: "market-growth", label: "Crescimento", path: "/custom/icons/crescimento-de-mercado.png" },
  { id: "openai", label: "OpenAI", path: "/custom/icons/11865338.png" },
  { id: "pix-3d", label: "PIX 3D", path: "/custom/icons/825540.png" },
  { id: "hbo-poster", label: "HBO Poster", path: "/custom/icons/10875822.jpg" },
  { id: "gold-photo", label: "Foto Ouro", path: "/custom/icons/10598498.jpg" },
  { id: "download", label: "Download", path: "/custom/icons/download.png" },
  { id: "img-main", label: "Imagem 1", path: "/custom/icons/images.jfif" },
  { id: "img-1-jfif", label: "Imagem 2", path: "/custom/icons/images-1.jfif" },
  { id: "img-1-png", label: "Imagem 3", path: "/custom/icons/images-1.png" },
  { id: "img-2", label: "Imagem 4", path: "/custom/icons/images-2.png" },
  { id: "netflix-alt", label: "Netflix Alt", path: "/custom/icons/png-clipart-netflix-round-logo-tech-companies-thumbnail.png" },
  { id: "shopee", label: "Shopee", path: "/custom/icons/icone-vendas-shopee-decorativo-marketplace-1491-3-2bc22aef0c13ed1c94c03c482de6997d.webp" },
];

export const CATEGORY_IMAGE_ICON_MAP = {
  Agenda3D: CUSTOM_MEDIA_ASSETS.agendaCheck3d,
  BitcoinCoin3D: CUSTOM_MEDIA_ASSETS.bitcoinCircle,
  BitcoinCoinDark: CUSTOM_MEDIA_ASSETS.bitcoinCircleDark,
  BuildingBadge: CUSTOM_MEDIA_ASSETS.buildingRound,
  Checklist3D: CUSTOM_MEDIA_ASSETS.agendaCheck3d,
  Cinema3D: CUSTOM_MEDIA_ASSETS.cinemaPopcorn,
  Contract3D: CUSTOM_MEDIA_ASSETS.contractSigned3d,
  CryptoHand3D: CUSTOM_MEDIA_ASSETS.bitcoinInHand,
  FoodCourt3D: CUSTOM_MEDIA_ASSETS.foodCourt,
  GoldBars3D: CUSTOM_MEDIA_ASSETS.goldBarsIcon,
  HboMaxLogo: CUSTOM_MEDIA_ASSETS.hboMaxSquare,
  Home3D: CUSTOM_MEDIA_ASSETS.houseStar,
  HomeOutline3D: CUSTOM_MEDIA_ASSETS.homeOutline,
  HomeRound3D: CUSTOM_MEDIA_ASSETS.homeGradient,
  IPhoneBadge: CUSTOM_MEDIA_ASSETS.iphoneImage,
  MarketGrowth3D: CUSTOM_MEDIA_ASSETS.marketGrowth,
  MercadoLivreLogo: CUSTOM_MEDIA_ASSETS.mercadoLivre,
  MoneySafe3D: CUSTOM_MEDIA_ASSETS.moneySafe3d,
  NetflixLogo: CUSTOM_MEDIA_ASSETS.netflixRoundAlt,
  NetflixLogoAlt: CUSTOM_MEDIA_ASSETS.netflixRoundAlt,
  OpenAiLogo: CUSTOM_MEDIA_ASSETS.openAiLogo,
  Planner3D: CUSTOM_MEDIA_ASSETS.plannerBook,
  Pix3D: CUSTOM_MEDIA_ASSETS.pixSymbol3d,
  PixLogo: CUSTOM_MEDIA_ASSETS.pixLogo,
  PrimeVideoLogo: CUSTOM_MEDIA_ASSETS.primeVideo,
  SpotifyLogo: CUSTOM_MEDIA_ASSETS.spotifyCircle,
  DisneyLogo: CUSTOM_MEDIA_ASSETS.disneyCircle,
  AmazonLogo: CUSTOM_MEDIA_ASSETS.amazonPrimeCircle,
  ShopeeLogo: CUSTOM_MEDIA_ASSETS.shopeeBag,
  ShopeeLogoAlt: CUSTOM_MEDIA_ASSETS.shopeeDecor,
  TesouroDiretoLogo: CUSTOM_MEDIA_ASSETS.tesouroDireto,
  WalletSafe3D: CUSTOM_MEDIA_ASSETS.moneySafe3d,
} as const;

export const getCategoryImageIconPath = (iconName?: string | null) => {
  const normalized = (iconName || "").trim();
  if (!normalized) return null;
  const key = normalized as keyof typeof CATEGORY_IMAGE_ICON_MAP;
  return CATEGORY_IMAGE_ICON_MAP[key] || null;
};

type SubscriptionLogoRule = {
  terms: string[];
  path: string;
};

const SUBSCRIPTION_LOGO_RULES: SubscriptionLogoRule[] = [
  {
    terms: ["netflix assinatura", "assinatura netflix", "netflix", "netlix", "netflx"],
    path: CUSTOM_MEDIA_ASSETS.netflixRoundAlt,
  },
  {
    terms: ["hbo max sem assinatura", "hbo max assinatura", "hbo max", "hbomax", "hbo", "htbo max", "htbomax", "htbo"],
    path: CUSTOM_MEDIA_ASSETS.hboMaxSquare,
  },
  {
    terms: ["spotify", "deezer", "apple music", "musica"],
    path: CUSTOM_MEDIA_ASSETS.spotifyCircle,
  },
  {
    terms: ["disney", "disney+", "disney plus"],
    path: CUSTOM_MEDIA_ASSETS.disneyCircle,
  },
  {
    terms: ["prime video", "amazon prime"],
    path: CUSTOM_MEDIA_ASSETS.primeVideo,
  },
  {
    terms: ["amazon", "prime"],
    path: CUSTOM_MEDIA_ASSETS.amazonPrimeCircle,
  },
  {
    terms: ["shopee"],
    path: CUSTOM_MEDIA_ASSETS.shopeeBag,
  },
  {
    terms: ["mercado livre", "mercadolivre"],
    path: CUSTOM_MEDIA_ASSETS.mercadoLivre,
  },
  {
    terms: ["chatgpt", "openai"],
    path: CUSTOM_MEDIA_ASSETS.openAiLogo,
  },
  {
    terms: ["pix"],
    path: CUSTOM_MEDIA_ASSETS.pixLogo,
  },
  {
    terms: ["youtube", "youtube premium"],
    path: CUSTOM_MEDIA_ASSETS.cinemaPopcorn,
  },
];

export const getSubscriptionLogoPath = (serviceName?: string | null) => {
  const normalized = normalizeText(serviceName);
  if (!normalized) return null;

  const match = SUBSCRIPTION_LOGO_RULES.find((rule) =>
    rule.terms.some((term) => normalized.includes(normalizeText(term))),
  );
  return match?.path || null;
};

const ALLOWED_SUBSCRIPTION_ICON_PREFIX = /^\/(?:icons|custom(?:\/icons)?)\//i;
const ALLOWED_SUBSCRIPTION_ICON_EXT = /\.(png|jpe?g|webp|jfif|svg)$/i;

export const sanitizeSubscriptionIconPath = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!ALLOWED_SUBSCRIPTION_ICON_PREFIX.test(raw)) return null;
  if (!ALLOWED_SUBSCRIPTION_ICON_EXT.test(raw)) return null;
  return raw;
};

type ResolveSubscriptionIconOptions = {
  fallbackToDefault?: boolean;
};

export const resolveSubscriptionIconPath = (
  serviceName?: string | null,
  customIconPath?: string | null,
  options?: ResolveSubscriptionIconOptions,
) => {
  const selectedPath = sanitizeSubscriptionIconPath(customIconPath);
  if (selectedPath) return selectedPath;

  const guessedPath = getSubscriptionLogoPath(serviceName);
  if (guessedPath) return guessedPath;

  return options?.fallbackToDefault ? CUSTOM_MEDIA_ASSETS.defaultServiceIcon : null;
};
