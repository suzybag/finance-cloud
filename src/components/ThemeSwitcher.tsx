"use client";

import { BookOpenText, MoonStar, Palette, SunMedium } from "lucide-react";
import { type ReactNode } from "react";
import { ThemeMode, useTheme } from "@/context/ThemeContext";

const buttonBaseClass =
  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-300";

const sliderClass =
  "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700/70 accent-violet-400";

const modeLabel: Record<ThemeMode, string> = {
  normal: "Modo Normal",
  "night-pro": "Night Pro",
  reading: "Modo Leitura",
};

export const ThemeSwitcher = () => {
  const {
    themeMode,
    setThemeMode,
    brightness,
    contrast,
    saturation,
    setBrightness,
    setContrast,
    setSaturation,
  } = useTheme();

  const modeOptions: Array<{ mode: ThemeMode; icon: ReactNode }> = [
    { mode: "night-pro", icon: <MoonStar className="h-3.5 w-3.5" /> },
    { mode: "reading", icon: <BookOpenText className="h-3.5 w-3.5" /> },
    { mode: "normal", icon: <SunMedium className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="rounded-2xl border border-violet-300/15 bg-slate-900/30 p-4">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-violet-300" />
        <h3 className="text-sm font-bold text-slate-100">Tema Global</h3>
      </div>

      <p className="mt-1 text-xs text-slate-400">Escolha o modo visual e ajuste intensidade global.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {modeOptions.map((option) => {
          const active = themeMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              className={`${buttonBaseClass} ${
                active
                  ? "border-violet-300/50 bg-violet-500/20 text-violet-100"
                  : "border-violet-300/20 bg-slate-950/40 text-slate-300 hover:bg-slate-900/65"
              }`}
              onClick={() => setThemeMode(option.mode)}
            >
              <span className="inline-flex items-center gap-1.5">
                {option.icon}
                {modeLabel[option.mode]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-200">Brilho ({brightness.toFixed(2)})</span>
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.01}
            value={brightness}
            onChange={(event) => setBrightness(Number(event.target.value))}
            className={sliderClass}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-200">Contraste ({contrast.toFixed(2)})</span>
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.01}
            value={contrast}
            onChange={(event) => setContrast(Number(event.target.value))}
            className={sliderClass}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-200">Saturacao ({saturation.toFixed(2)})</span>
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.01}
            value={saturation}
            onChange={(event) => setSaturation(Number(event.target.value))}
            className={sliderClass}
          />
        </label>
      </div>
    </div>
  );
};
