import type { Metadata } from "next";

// The page is a client component, so its <title> comes from here (root template: "%s · RaSi Fiters").
export const metadata: Metadata = { title: "Create account" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
