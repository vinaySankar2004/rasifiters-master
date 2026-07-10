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
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#070809" }
  ]
};

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
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
