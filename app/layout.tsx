import type { Metadata } from "next";
import { Jost, Inter, Cairo } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/context";
import { ThemeProvider } from "@/lib/theme/context";

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
    "Dar Al Hay (DAH) curates events and pop-ups across Dubai that give ambitious businesses a real audience, real sales, and room to grow.",
  openGraph: {
    type: "website",
    siteName: "Dar Al Hay (DAH)",
    title: "Dar Al Hay (DAH) — A Stage for Dubai's Young Entrepreneurs",
    description:
      "Dar Al Hay (DAH) curates events and pop-ups across Dubai that give ambitious businesses a real audience, real sales, and room to grow.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

// Runs synchronously before first paint (a blocking <head> script, not a
// React effect) so the correct theme's colors are already in place when the
// page is first drawn — this is what prevents a light-mode flash for a
// dark-mode visitor. Kept in sync with lib/theme/context.tsx's STORAGE_KEY.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var k="dah_theme",s=localStorage.getItem(k),t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} ${arabic.variable} h-full antialiased`}
      // The no-flash script below sets data-theme on this element before
      // React hydrates, so the server-rendered markup (which has no
      // data-theme, since the real theme is only knowable client-side)
      // will always "mismatch" the live DOM on this one attribute — that's
      // expected and harmless, not a bug to fix upstream.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-cream-soft text-ink">
        <ThemeProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
