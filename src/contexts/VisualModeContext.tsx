"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type VisualMode = "default" | "relax" | "black";

type VisualModeContextValue = {
  visualMode: VisualMode;
  setVisualMode: (mode: VisualMode) => void;
};

const VISUAL_MODE_STORAGE_KEY = "finance_cloud_visual_mode";
const BODY_MODE_CLASSES = ["mode-relax", "mode-black"] as const;

const VisualModeContext = createContext<VisualModeContextValue | null>(null);

const isVisualMode = (value: string | null): value is VisualMode =>
  value === "default" || value === "relax" || value === "black";

const getInitialVisualMode = (): VisualMode => {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(VISUAL_MODE_STORAGE_KEY);
  return isVisualMode(stored) ? stored : "default";
};

const applyBodyClass = (mode: VisualMode) => {
  const body = document.body;
  BODY_MODE_CLASSES.forEach((className) => body.classList.remove(className));
  if (mode === "relax") body.classList.add("mode-relax");
  if (mode === "black") body.classList.add("mode-black");
};

export const VisualModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [visualMode, setVisualMode] = useState<VisualMode>(getInitialVisualMode);

  useEffect(() => {
    applyBodyClass(visualMode);
    window.localStorage.setItem(VISUAL_MODE_STORAGE_KEY, visualMode);
  }, [visualMode]);

  const value = useMemo<VisualModeContextValue>(
    () => ({
      visualMode,
      setVisualMode,
    }),
    [visualMode],
  );

  return <VisualModeContext.Provider value={value}>{children}</VisualModeContext.Provider>;
};

export const useVisualMode = () => {
  const context = useContext(VisualModeContext);
  if (!context) {
    throw new Error("useVisualMode must be used within VisualModeProvider");
  }
  return context;
};
