import type { Metadata } from "next";
import { Playfair_Display, Crimson_Pro, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const crimson = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prompt Smith",
  description: "Editorial-style prompt engineering wizard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${crimson.variable} ${ibmPlex.variable} ${jetbrains.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
