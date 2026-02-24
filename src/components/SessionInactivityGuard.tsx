"use client";

import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setStorageItem } from "@/lib/safeStorage";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "focus",
];

const LAST_ACTIVITY_KEY = "finance_last_activity_at";
const DEFAULT_IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES || "15");

export const SessionInactivityGuard = () => {
  const timerRef = useRef<number | null>(null);

  const idleTimeoutMs = useMemo(() => {
    if (!Number.isFinite(DEFAULT_IDLE_MINUTES)) return 15 * 60 * 1000;
    return Math.max(1, DEFAULT_IDLE_MINUTES) * 60 * 1000;
  }, []);

  useEffect(() => {
    let mounted = true;

    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const runIdleLogout = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted || !data.session) return;
        await supabase.auth.signOut();
        window.location.replace("/?reason=idle");
      } catch {
        // best effort guard: if session lookup fails, keep app running
      }
    };

    const schedule = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        clearTimer();
        if (!mounted || !data.session) return;

        timerRef.current = window.setTimeout(() => {
          void runIdleLogout();
        }, idleTimeoutMs);
      } catch {
        clearTimer();
      }
    };

    const markActivity = () => {
      if (document.visibilityState === "hidden") return;
      setStorageItem(LAST_ACTIVITY_KEY, String(Date.now()), "local");
      void schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") {
        markActivity();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        void schedule();
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActivity));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearTimer();
        return;
      }
      markActivity();
    });

    markActivity();

    return () => {
      mounted = false;
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      authListener.subscription.unsubscribe();
    };
  }, [idleTimeoutMs]);

  return null;
};
