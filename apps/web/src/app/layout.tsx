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

export const metadata: Metadata = {
  metadataBase,
  title: "RaSi Fiters",
  description: "RaSi Fiters web app",
  applicationName: "RaSi Fiters",
  icons: {
    icon: [
      { url: "/brand/app-icon.png" },
      { url: "/brand/app-icon-dark.png", media: "(prefers-color-scheme: dark)" }
    ],
    apple: [
      { url: "/brand/app-icon.png" },
      { url: "/brand/app-icon-dark.png", media: "(prefers-color-scheme: dark)" }
    ]
  },
  openGraph: {
    type: "website",
    locale: "en",
    url: metadataBase.origin,
    siteName: "RaSi Fiters",
    title: "RaSi Fiters",
    description: "RaSi Fiters web app",
    images: [{ url: "/brand/app-icon.png", width: 512, height: 512, alt: "RaSi Fiters" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "RaSi Fiters",
    description: "RaSi Fiters web app",
    images: ["/brand/app-icon.png"]
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
