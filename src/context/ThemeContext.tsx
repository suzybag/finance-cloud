"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getStorageItem, setStorageItem } from "@/lib/safeStorage";

export type ThemeMode = "normal" | "night-pro" | "reading";

type ThemeState = {
  themeMode: ThemeMode;
  brightness: number;
  contrast: number;
  saturation: number;
};

type ThemeContextValue = ThemeState & {
  setThemeMode: (mode: ThemeMode) => void;
  setBrightness: (value: number) => void;
  setContrast: (value: number) => void;
  setSaturation: (value: number) => void;
};

const STORAGE_KEY = "finance_cloud_theme_preferences";
const BODY_THEME_CLASSES = ["theme-normal", "theme-night-pro", "theme-reading"] as const;

const MODE_PRESETS: Record<ThemeMode, Pick<ThemeState, "brightness" | "contrast" | "saturation">> = {
  normal: { brightness: 1, contrast: 1, saturation: 1 },
  "night-pro": { brightness: 1, contrast: 0.95, saturation: 0.9 },
  reading: { brightness: 0.94, contrast: 0.84, saturation: 0.78 },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const clamp = (value: number, min = 0.6, max = 1.4) => Math.min(max, Math.max(min, value));

const isThemeMode = (value: string | undefined): value is ThemeMode =>
  value === "normal" || value === "night-pro" || value === "reading";

const normalizeNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed);
};

const getInitialState = (): ThemeState => {
  if (typeof window === "undefined") {
    return { themeMode: "normal", ...MODE_PRESETS.normal };
  }

  const fallback: ThemeState = { themeMode: "normal", ...MODE_PRESETS.normal };
  const raw = getStorageItem(STORAGE_KEY, "local");
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    const mode = isThemeMode(parsed.themeMode) ? parsed.themeMode : "normal";
    const preset = MODE_PRESETS[mode];

    return {
      themeMode: mode,
      brightness: normalizeNumber(parsed.brightness, preset.brightness),
      contrast: normalizeNumber(parsed.contrast, preset.contrast),
      saturation: normalizeNumber(parsed.saturation, preset.saturation),
    };
  } catch {
    return fallback;
  }
};

const applyThemeClass = (themeMode: ThemeMode) => {
  const body = document.body;
  BODY_THEME_CLASSES.forEach((className) => body.classList.remove(className));
  if (themeMode === "night-pro") {
    body.classList.add("theme-night-pro");
    return;
  }
  if (themeMode === "reading") {
    body.classList.add("theme-reading");
    return;
  }
  body.classList.add("theme-normal");
};

const applyFilterVariables = ({ brightness, contrast, saturation }: ThemeState) => {
  const root = document.documentElement;
  root.style.setProperty("--brightness", brightness.toFixed(2));
  root.style.setProperty("--contrast", contrast.toFixed(2));
  root.style.setProperty("--saturation", saturation.toFixed(2));
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ThemeState>(getInitialState);

  useEffect(() => {
    applyThemeClass(state.themeMode);
    applyFilterVariables(state);
    setStorageItem(STORAGE_KEY, JSON.stringify(state), "local");
  }, [state]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      setThemeMode: (themeMode) =>
        setState((prev) => ({
          ...prev,
          themeMode,
          ...MODE_PRESETS[themeMode],
        })),
      setBrightness: (brightness) =>
        setState((prev) => ({
          ...prev,
          brightness: clamp(brightness),
        })),
      setContrast: (contrast) =>
        setState((prev) => ({
          ...prev,
          contrast: clamp(contrast),
        })),
      setSaturation: (saturation) =>
        setState((prev) => ({
          ...prev,
          saturation: clamp(saturation),
        })),
    }),
    [state],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
