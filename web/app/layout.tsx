import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tímastjórnun — Stjórnborð",
  description: "GPS-byggt tímaskráningarkerfi",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="is">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
