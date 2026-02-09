import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Cloud",
  description: "Painel financeiro pessoal na nuvem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
