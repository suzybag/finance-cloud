const normalizeText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const CUSTOM_MEDIA_ASSETS = {
  goldBarsPhoto: "/custom/icons/barras-de-ouro.png",
  hboMaxPoster: "/icons/hbo-max.png",
  openAiLogo: "/icons/ChatGPT.png",
  pixSymbol3d: "/custom/icons/Pix.png",
  agendaCheck3d: "/custom/icons/agenda-13753233.png",
  contractSigned3d: "/custom/icons/Ganhei.png",
  goldBarsIcon: "/custom/icons/barras-de-ouro.png",
  bitcoinCircle: "/custom/icons/bitcoin.png",
  bitcoinCircleDark: "/custom/icons/bitcoin-1.png",
  bitcoinInHand: "/custom/icons/bitcoin.png",
  bitcoinLogoDark: "/custom/icons/bitcoin.png",
  moneySafe3d: "/custom/icons/CDB-Caixinha.webp",
  houseStar: "/custom/icons/casa-nova.png",
  marketGrowth: "/custom/icons/crescimento-de-mercado.png",
  netflixRound: "/icons/netflix.png",
  homeOutline: "/custom/icons/casa-nova.png",
  shopeeDecor: "/custom/icons/Shopee.png",
  iphoneImage: "/custom/icons/Icloud.png",
  buildingRound: "/custom/icons/crescimento-de-mercado.png",
  hboMaxSquare: "/icons/hbo-max.png",
  primeVideo: "/icons/Prime-video.png",
  homeGradient: "/custom/icons/casa-nova.png",
  mercadoLivre: "/icons/Mercado-Pago.png",
  pixLogo: "/custom/icons/Pix.png",
  forkKnife: "/custom/icons/praca-de-alimentacao.png",
  netflixRoundAlt: "/icons/netflix.png",
  foodCourt: "/custom/icons/praca-de-alimentacao.png",
  tesouroDireto: "/custom/icons/CDB-Caixinha.webp",
  cinemaPopcorn: "/icons/Cinema.png",
  uberVideo: "/icons/Uber.png",
  shopeeBag: "/custom/icons/Shopee.png",
  plannerBook: "/custom/icons/agenda-13753233.png",
  spotifyCircle: "/icons/spotify.png",
  disneyCircle: "/icons/disney.png",
  amazonPrimeCircle: "/icons/Prime-video.png",
  defaultServiceIcon: "/icons/Cinema.png",
} as const;

export type SubscriptionIconOption = {
  id: string;
  label: string;
  path: string;
};

export const SUBSCRIPTION_ICON_OPTIONS: SubscriptionIconOption[] = [
  { id: "default", label: "Padrao", path: "/icons/Cinema.png" },
  { id: "netflix", label: "Netflix", path: "/icons/netflix.png" },
  { id: "hbo-max", label: "HBO Max", path: "/icons/hbo-max.png" },
  { id: "spotify", label: "Spotify", path: "/icons/spotify.png" },
  { id: "disney", label: "Disney", path: "/icons/disney.png" },
  { id: "prime-video", label: "Prime Video", path: "/icons/Prime-video.png" },
  { id: "mercado-pago", label: "Mercado Pago", path: "/icons/Mercado-Pago.png" },
  { id: "uber", label: "Uber", path: "/icons/Uber.png" },
  { id: "icloud", label: "iCloud", path: "/icons/Icloud.png" },
  { id: "cinema", label: "Cinema", path: "/icons/Cinema.png" },
  { id: "openai", label: "ChatGPT", path: "/icons/ChatGPT.png" },
];

export const AGENDA_ICON_OPTIONS: SubscriptionIconOption[] = [
  { id: "agenda", label: "Agenda", path: "/custom/icons/agenda-13753233.png" },
  { id: "lembrete", label: "Lembrete", path: "/custom/icons/agenda-13753233.png" },
  { id: "icloud", label: "Nuvem", path: "/custom/icons/Icloud.png" },
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
    terms: ["mercado pago", "mercadopago", "mercado livre", "mercadolivre"],
    path: CUSTOM_MEDIA_ASSETS.mercadoLivre,
  },
  {
    terms: ["uber one", "uber eats", "uber"],
    path: CUSTOM_MEDIA_ASSETS.uberVideo,
  },
  {
    terms: ["chatgpt", "openai", "gpt", "gptplus", "gpt plus"],
    path: CUSTOM_MEDIA_ASSETS.openAiLogo,
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
const SUBSCRIPTION_ICON_PATH_SET = new Set(SUBSCRIPTION_ICON_OPTIONS.map((item) => item.path));
const LEGACY_SUBSCRIPTION_ICON_PATH_ALIASES: Record<string, string> = {
  "/icons/Netflix.png": "/icons/netflix.png",
  "/icons/Netflix.film.png": "/icons/netflix.png",
  "/icons/Mercado.Pago.png": "/icons/Mercado-Pago.png",
  "/icons/uber.png": "/icons/Uber.png",
};
const AUTO_SUBSCRIPTION_PLACEHOLDER_PATHS = new Set([
  CUSTOM_MEDIA_ASSETS.defaultServiceIcon,
  "/icons/Prime-video.png",
  "/custom/icons/7544981.png",
  "/custom/icons/11865338.png",
  "/icons/Photoroom.png",
]);

export const sanitizeSubscriptionIconPath = (value?: string | null) => {
  const input = String(value || "").trim();
  const raw = LEGACY_SUBSCRIPTION_ICON_PATH_ALIASES[input] || input;
  if (!raw) return null;
  if (!ALLOWED_SUBSCRIPTION_ICON_PREFIX.test(raw)) return null;
  if (!ALLOWED_SUBSCRIPTION_ICON_EXT.test(raw)) return null;
  if (!SUBSCRIPTION_ICON_PATH_SET.has(raw)) return null;
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
  const guessedPath = getSubscriptionLogoPath(serviceName);
  const selectedPath = sanitizeSubscriptionIconPath(customIconPath);
  if (selectedPath) {
    // Keep backward compatibility for rows that previously stored a generic
    // placeholder icon (prime/piggy/photoroom) and now have a detectable brand.
    if (guessedPath && AUTO_SUBSCRIPTION_PLACEHOLDER_PATHS.has(selectedPath)) return guessedPath;
    return selectedPath;
  }

  if (guessedPath) return guessedPath;

  return options?.fallbackToDefault ? CUSTOM_MEDIA_ASSETS.defaultServiceIcon : null;
};
