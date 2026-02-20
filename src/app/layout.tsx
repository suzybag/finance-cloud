import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionInactivityGuard } from "@/components/SessionInactivityGuard";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

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
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${fontSans.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
        <SessionInactivityGuard />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
