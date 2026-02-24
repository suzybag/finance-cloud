"use client";

import { useEffect } from "react";

const SW_VERSION = "2026-02-24-2";

export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`/sw.js?v=${SW_VERSION}`, {
          updateViaCache: "none",
        });
        if (!mounted) return;
        await registration.update().catch(() => null);
      } catch {
        // Registration failure should not block the app.
      }
    };

    void register();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
};
