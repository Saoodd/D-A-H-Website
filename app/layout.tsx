import type { Metadata } from "next";
import { Jost, Inter, Cairo } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/context";

const heading = Jost({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const arabic = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Dar Al Hay (DAH) — A Stage for Dubai's Young Entrepreneurs",
    template: "%s — Dar Al Hay (DAH)",
  },
  description:
    "Dar Al Hay (DAH) curates community pop-up markets in Dubai that give young and emerging entrepreneurs a real audience, real sales, and room to grow.",
  openGraph: {
    type: "website",
    siteName: "Dar Al Hay (DAH)",
    title: "Dar Al Hay (DAH) — A Stage for Dubai's Young Entrepreneurs",
    description:
      "Dar Al Hay (DAH) curates community pop-up markets in Dubai that give young and emerging entrepreneurs a real audience, real sales, and room to grow.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${arabic.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cream-soft text-ink">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
