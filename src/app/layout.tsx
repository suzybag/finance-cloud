import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionInactivityGuard } from "@/components/SessionInactivityGuard";
import { ConfirmDialogProvider } from "@/context/ConfirmDialogContext";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

const PRELOAD_SW_CLEANUP_SCRIPT = `
(() => {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const userAgent = navigator.userAgent || "";
    const inAppBrowser = /WhatsApp|FBAN|FBAV|Instagram/i.test(userAgent);

    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          const scriptUrl = registration.active?.scriptURL
            || registration.waiting?.scriptURL
            || registration.installing?.scriptURL
            || "";
          if (inAppBrowser || scriptUrl.includes("/sw.js")) {
            void registration.unregister();
          }
        });
      })
      .catch(() => null);

    if ("caches" in window) {
      caches.keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("finance-cloud"))
              .map((key) => caches.delete(key)),
          ),
        )
        .catch(() => null);
    }
  } catch {
    // best effort cleanup
  }
})();
`;

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  applicationName: "Finance Cloud",
  title: "Finance Cloud",
  description: "Painel financeiro pessoal na nuvem",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Finance Cloud",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          id="sw-pre-cleanup"
          dangerouslySetInnerHTML={{ __html: PRELOAD_SW_CLEANUP_SCRIPT }}
        />
      </head>
      <body className={`${fontSans.variable} antialiased`}>
        <ThemeProvider>
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </ThemeProvider>
        <SessionInactivityGuard />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
