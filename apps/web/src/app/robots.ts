import type { MetadataRoute } from "next";

// Allow all crawlers; point them at the sitemap. Disallow the auth-gated app
// routes and the unlinked /splash so crawl budget stays on the marketing pages.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rasifiters.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/splash",
        "/programs",
        "/program",
        "/members",
        "/summary",
        "/lifestyle",
        "/reset-password",
        "/delete-account"
      ]
    },
    sitemap: new URL("/sitemap.xml", appUrl).toString(),
    host: appUrl
  };
}
