"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";

// NET-NEW page (no legacy reference) — the SECOND step of the Supabase-Auth self-service recovery path,
// the destination of the reset email's link. See specs/pages/web/reset-password/SPEC.md.
//
// Flow (auth SPEC D-C5): Supabase uses the IMPLICIT flow, so the email link lands here with the recovery
// session in the URL fragment (#access_token=...&type=recovery). This page reads that fragment, shows a
// new-password form, and forwards the access_token as the Bearer to POST /auth/reset-password — the client
// never embeds Supabase (R1). On success the user is sent to /login to sign in with the new password.

// Mirrors the server-side validatePassword policy (authService.js): >=8 chars, a lowercase, an uppercase,
// and a digit. Client-side hint only; the backend re-validates.
const isStrongPassword = (pw: string) =>
  pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);

// Where login confirms the reset (a new ?reason banner case on the login page).
const LOGIN_AFTER_RESET = "/login?reason=password-reset";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { session, isBootstrapping } = useAuth();

  // The recovery access_token, read once from the URL fragment on mount. `undefined` = not yet parsed,
  // `null` = parsed but absent/invalid (show the "link expired" state).
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parse the recovery session from the URL fragment, then scrub it from the address bar so the token
  // doesn't linger in history. Supabase puts either the session (#access_token=...&type=recovery) or an
  // error (#error=...&error_description=...) in the fragment.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(raw);

    const error = params.get("error_description") || params.get("error");
    const token = params.get("access_token");

    if (error) {
      setLinkError(error.replace(/\+/g, " "));
      setAccessToken(null);
    } else if (token) {
      setAccessToken(token);
    } else {
      setAccessToken(null);
    }

    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // Consistent with splash/login/forgot: an already-authenticated visitor is sent to /programs — but
  // NOT when a recovery token is present (a logged-in user who clicked a reset link should still reset).
  useEffect(() => {
    if (!isBootstrapping && session && accessToken === null && !linkError) {
      router.replace("/programs");
    }
  }, [isBootstrapping, session, accessToken, linkError, router]);

  const passwordStrong = useMemo(() => isStrongPassword(password), [password]);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const showPolicyHint = password.length > 0 && !passwordStrong;
  const showMatchHint = confirm.length > 0 && !passwordsMatch;
  const canSubmit = Boolean(accessToken) && passwordStrong && passwordsMatch && !isLoading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !accessToken) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await resetPassword(accessToken, password);
      setSubmitted(true);
      // Brief confirmation, then to login to sign in with the new password.
      setTimeout(() => router.replace(LOGIN_AFTER_RESET), 2200);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The recovery token expired / was already used — only a fresh link can recover.
        setAccessToken(null);
        setLinkError(
          "This password reset link has expired or has already been used. Request a new one below."
        );
      } else if (error instanceof Error && error.message) {
        // e.g. the server password-policy 400 — surface it inline.
        setErrorMessage(error.message);
      } else {
        setErrorMessage("We couldn't reset your password just now. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const showForm = accessToken !== null && !linkError;

  return (
    <div className="relative flex min-h-screen flex-col items-center px-6 pb-12 pt-14 sm:px-10 sm:pt-20">
      <motion.div
        className="flex w-full max-w-md flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <BrandMark size={128} />

        <div className="mt-8 text-center">
          <h1 className="text-2xl font-semibold text-rf-text sm:text-3xl">Set a new password</h1>
          <p className="mt-2 text-sm font-semibold text-rf-text-muted sm:text-base">
            Choose a new password for your account.
          </p>
        </div>

        {submitted ? (
          <div className="mt-10 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 sm:text-base">
            Your password has been reset. Redirecting you to login…
          </div>
        ) : linkError ? (
          <div className="mt-10 w-full">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 sm:text-base">
              {linkError}
            </div>
            <div className="mt-6 text-center text-sm sm:text-base">
              <Link
                href="/forgot-password"
                className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
              >
                Request a new reset link
              </Link>
            </div>
          </div>
        ) : !showForm ? (
          // accessToken still undefined (parsing) — render nothing extra to avoid a flash.
          <div className="mt-10 h-6" />
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 flex w-full flex-col gap-4">
            <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-xs font-semibold text-rf-text-muted transition hover:text-rf-text sm:text-sm"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </label>

            <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                autoComplete="new-password"
              />
            </label>

            {showPolicyHint && (
              <p className="px-1 text-xs font-semibold text-rf-text-muted sm:text-sm">
                Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.
              </p>
            )}

            {showMatchHint && (
              <p className="px-1 text-xs font-semibold text-rf-text-muted sm:text-sm">
                Passwords don&apos;t match.
              </p>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="button-primary button-primary--dark-white mt-2 inline-flex min-h-[50px] items-center justify-center rounded-full px-8 text-base font-semibold"
            >
              {isLoading ? "Saving..." : "Reset password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm sm:text-base">
          <Link
            href="/login"
            className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Back to login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
