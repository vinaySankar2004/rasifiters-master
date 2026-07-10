"use client";

import { useEffect, useRef } from "react";
import { GOOGLE_WEB_CLIENT_ID } from "@/lib/config";

// "Continue with Google" via Google Identity Services (GSI). The script is lazy-injected once; the GSI
// callback hands back a Google ID token (response.credential) which the caller forwards to the backend
// /auth/oauth exchange (R1: the browser never embeds Supabase). Renders nothing when the client id is
// unset so the page still builds/deploys before NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is configured.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("gsi load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi load failed"));
    document.head.appendChild(script);
  });
}

export function GoogleSignInButton({
  onCredential,
  disabled
}: {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_WEB_CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (response?.credential) onCredential(response.credential);
          }
        });
        readyRef.current = true;
        if (targetRef.current) {
          window.google.accounts.id.renderButton(targetRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "continue_with",
            width: 320
          });
        }
      })
      .catch(() => {
        // GSI unavailable (offline/blocked) — leave the fallback affordance in place.
      });

    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  // No client id configured yet — render nothing so the page still builds/deploys.
  if (!GOOGLE_WEB_CLIENT_ID) return null;

  return (
    <div className="flex w-full flex-col items-center">
      <div ref={targetRef} className="flex justify-center" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (readyRef.current) window.google?.accounts?.id?.prompt();
        }}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      >
        Continue with Google
      </button>
    </div>
  );
}
