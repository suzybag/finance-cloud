"use client";

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Car,
  CircleDollarSign,
  Clapperboard,
  CreditCard,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PiggyBank,
  Receipt,
  Repeat,
  ShoppingCart,
  Smartphone,
  Tag,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { resolveCategoryVisual } from "@/lib/categoryVisuals";

const ICONS: Record<string, LucideIcon> = {
  Tag,
  Home,
  ShoppingCart,
  UtensilsCrossed,
  Car,
  HeartPulse,
  GraduationCap,
  Clapperboard,
  PiggyBank,
  CreditCard,
  Repeat,
  CircleDollarSign,
  Receipt,
  Wallet,
  Landmark,
  Briefcase,
  Smartphone,
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

  const Icon = ICONS[visual.iconName] || Tag;
  const solidColor = visual.iconColor;
  const bg = hexToRgba(solidColor, 0.17) || "rgba(15, 23, 42, 0.55)";
  const border = hexToRgba(solidColor, 0.36) || "rgba(148, 163, 184, 0.3)";

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
      <Icon size={size} strokeWidth={2.1} />
    </span>
  );
}
