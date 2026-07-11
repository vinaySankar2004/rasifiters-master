import type { MetadataRoute } from "next";

// Public, crawlable entry pages only. Auth-gated app routes (programs, program,
// members, summary, lifestyle, reset-password) and the unlinked /splash are
// intentionally omitted — they carry no marketing value and require a session.
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rasifiters.com";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/create-account",
  "/forgot-password",
  "/privacy-policy",
  "/support"
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: new URL(path, appUrl).toString(),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6
  }));
}
