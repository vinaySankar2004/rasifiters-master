"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";

type Variant = "nav" | "hero" | "final";

// Auth-aware call to action. Logged-out (and during SSR / first paint) it points to
// /login; once a session is confirmed it becomes "Open app" → /programs. The mounted
// guard means the server and first client render agree (logged-out), so there is no
// hydration mismatch; it swaps only after bootstrap resolves on the client.
export function AuthCta({ variant }: { variant: Variant }) {
  const { session, isBootstrapping } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const signedIn = mounted && !isBootstrapping && Boolean(session);
  const href = signedIn ? "/programs" : "/login";
  const label = signedIn ? "Open app" : "Log in";

  if (variant === "nav") {
    return (
      <Link
        href={href}
        className="button-primary button-primary--dark-white inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
      >
        {label}
      </Link>
    );
  }

  const big = "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-6 py-3 text-base font-semibold";
  if (variant === "final") {
    return (
      <Link href={href} className={`button-primary button-primary--dark-white ${big}`}>
        {signedIn ? "Open app" : "Log in to get started"}
      </Link>
    );
  }

  // hero
  return (
    <Link href={href} className={`button-primary button-primary--dark-white ${big}`}>
      {signedIn ? "Open the app" : "Log in"}
    </Link>
  );
}
