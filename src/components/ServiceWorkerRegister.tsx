"use client";

import { useEffect } from "react";

const SW_VERSION = "2026-02-24-2";
const IN_APP_BROWSER_REGEX = /WhatsApp|FBAN|FBAV|Instagram/i;

export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const userAgent = navigator.userAgent || "";
    const inAppBrowser = IN_APP_BROWSER_REGEX.test(userAgent);

    let mounted = true;

    const register = async () => {
      try {
        if (inAppBrowser) {
          const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
          await Promise.all(registrations.map((registration) => registration.unregister()));
          return;
        }

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
