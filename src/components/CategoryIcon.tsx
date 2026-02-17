"use client";

import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bitcoin,
  Briefcase,
  Car,
  ChartColumnIncreasing,
  CircleDollarSign,
  Clapperboard,
  CreditCard,
  FileCheck,
  Gem,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  House,
  HousePlus,
  Landmark,
  NotebookPen,
  NotebookTabs,
  PlayCircle,
  PiggyBank,
  Popcorn,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Music2,
  Utensils,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { getCategoryImageIconPath } from "@/lib/customMedia";
import { resolveCategoryVisual } from "@/lib/categoryVisuals";

const ICONS: Record<string, LucideIcon> = {
  Tag,
  Home,
  House,
  HousePlus,
  ShoppingCart,
  Utensils,
  UtensilsCrossed,
  Car,
  HeartPulse,
  GraduationCap,
  Clapperboard,
  ChartColumnIncreasing,
  NotebookPen,
  NotebookTabs,
  BadgeCheck,
  FileCheck,
  HandCoins,
  Bitcoin,
  Gem,
  Popcorn,
  PiggyBank,
  CreditCard,
  Repeat,
  CircleDollarSign,
  Receipt,
  Wallet,
  Landmark,
  Briefcase,
  Smartphone,
  HomeOutline: House,
  FoodSquare: Utensils,
  ChecklistBook: NotebookPen,
  GrowthChart: ChartColumnIncreasing,
  BitcoinBadge: Bitcoin,
  SweetHome: HousePlus,
  HomeRound: Home,
  AgendaBook: NotebookTabs,
  TodoList: BadgeCheck,
  CryptoHand: HandCoins,
  ContractDoc: FileCheck,
  BitcoinCoin: Bitcoin,
  GoldBars: Gem,
  PopcornCinema: Popcorn,
  Agenda3D: NotebookTabs,
  BitcoinCoin3D: Bitcoin,
  BitcoinCoinDark: Bitcoin,
  BuildingBadge: Landmark,
  Checklist3D: BadgeCheck,
  Cinema3D: Popcorn,
  Contract3D: FileCheck,
  CryptoHand3D: HandCoins,
  FoodCourt3D: UtensilsCrossed,
  GoldBars3D: Gem,
  HboMaxLogo: Clapperboard,
  Home3D: HousePlus,
  HomeOutline3D: House,
  HomeRound3D: Home,
  IPhoneBadge: Smartphone,
  MarketGrowth3D: ChartColumnIncreasing,
  MercadoLivreLogo: ShoppingCart,
  MoneySafe3D: Wallet,
  NetflixLogo: Clapperboard,
  NetflixLogoAlt: Clapperboard,
  OpenAiLogo: Briefcase,
  Planner3D: NotebookPen,
  Pix3D: Repeat,
  PixLogo: Repeat,
  PrimeVideoLogo: Clapperboard,
  SpotifyLogo: Music2,
  DisneyLogo: PlayCircle,
  AmazonLogo: ShoppingBag,
  ShopeeLogo: ShoppingCart,
  ShopeeLogoAlt: ShoppingCart,
  TesouroDiretoLogo: Landmark,
  WalletSafe3D: Wallet,
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  const safe = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(safe)) return null;

  const num = Number.parseInt(safe, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type CategoryIconProps = {
  categoryName?: string | null;
  iconName?: string | null;
  iconColor?: string | null;
  size?: number;
  circleSize?: number;
  className?: string;
};

export function CategoryIcon({
  categoryName,
  iconName,
  iconColor,
  size = 14,
  circleSize = 28,
  className = "",
}: CategoryIconProps) {
  const visual = resolveCategoryVisual({
    categoryName,
    iconName,
    iconColor,
  });

  const guessedVisual = resolveCategoryVisual({ categoryName });
  const imageIconPath = getCategoryImageIconPath(visual.iconName);
  const Icon = ICONS[visual.iconName] || ICONS[guessedVisual.iconName] || Tag;
  const solidColor = visual.iconColor;
  const bg = hexToRgba(solidColor, 0.17) || "rgba(15, 23, 42, 0.55)";
  const border = hexToRgba(solidColor, 0.36) || "rgba(148, 163, 184, 0.3)";
  const imageSize = Math.max(12, size + 4);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${className}`.trim()}
      style={{
        width: circleSize,
        height: circleSize,
        backgroundColor: bg,
        borderColor: border,
        color: solidColor,
      }}
      aria-hidden="true"
    >
      {imageIconPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageIconPath}
          alt=""
          className="rounded-sm object-contain"
          style={{ width: imageSize, height: imageSize }}
          loading="lazy"
        />
      ) : (
        <Icon size={size} strokeWidth={2.1} />
      )}
    </span>
  );
}
