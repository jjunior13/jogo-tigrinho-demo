import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tigrinho Brasil",
  description: "Protótipo educativo de slot 3x3 temático com som e rolagem vertical.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased bg-emerald-950 text-yellow-50">{children}</body>
    </html>
  );
}
