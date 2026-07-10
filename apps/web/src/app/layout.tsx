import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AppProviders } from "@/app/providers";
import { AppShell } from "@/app/shell";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://rasifiters.com";
const metadataBase = new URL(appUrl);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
  // NOTE: theme-color is intentionally NOT set here. It must follow the RESOLVED app theme
  // (data-theme, which can be an explicit user override), not the OS prefers-color-scheme.
  // The pre-paint bootstrap script below owns a single theme-color meta; lib/theme.ts keeps
  // it in sync at runtime. (A Next-managed meta here would be re-added on every navigation
  // and fight the JS-owned one — the source of the earlier client-side crash.)
};

// Runs synchronously before first paint: resolves the stored theme, sets data-theme +
// color-scheme, and writes the theme-color meta iOS Safari samples during parse. Doing this
// pre-paint (not in a useEffect) is what makes the mobile status bar match a dark override and
// removes the light->dark theme flash. Kept dependency-free and inlined so it can't be deferred.
const THEME_BOOTSTRAP = `(function(){try{var k="rf:appearance",p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"&&p!=="system")p="system";var r=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var e=document.documentElement;e.dataset.theme=r;e.style.colorScheme=r;var c=r==="dark"?"#070809":"#f4f3f7";var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m);}m.setAttribute("content",c);}catch(_){}})();`;

const TITLE = "RaSi Fiters: Fitness programs, tracked together";
const DESCRIPTION =
  "Join a fitness program, log workouts and daily health, and track your whole group's progress with leaderboards, streaks and analytics. On iPhone, Android and the web.";

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: TITLE,
    template: "%s · RaSi Fiters"
  },
  description: DESCRIPTION,
  applicationName: "RaSi Fiters",
  icons: {
    icon: [
      { url: "/brand/app-icon.png" }
    ],
    apple: [
      { url: "/brand/app-icon.png" }
    ]
  },
  openGraph: {
    type: "website",
    locale: "en",
    url: metadataBase.origin,
    siteName: "RaSi Fiters",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: "RaSi Fiters, fitness programs tracked together" }]
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/marketing/og-image.png"]
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
