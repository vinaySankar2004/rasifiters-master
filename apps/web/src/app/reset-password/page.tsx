"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { resetPasswordWithCode } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

// NET-NEW page (no legacy reference) — the SECOND step of the Supabase-Auth self-service recovery path.
// See specs/pages/web/reset-password/SPEC.md.
//
// Flow (auth SPEC D-C5, revised): recovery now uses a typed 6-digit CODE, not a magic link — email
// scanners (Outlook Safe Links) were pre-consuming the single-use link. The user arrives here from
// forgot-password with their email in the query string (?email=…), enters the code from the recovery
// email + a new password, and POSTs to /auth/reset-password { email, code, new_password }. The client
// never embeds Supabase (R1). On success the user is sent to /login to sign in with the new password.

// Mirrors the server-side validatePassword policy (authService.js): >=8 chars, a lowercase, an uppercase,
// and a digit. Client-side hint only; the backend re-validates.
const isStrongPassword = (pw: string) =>
  pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);

// Where login confirms the reset (a ?reason banner case on the login page).
const LOGIN_AFTER_RESET = "/login?reason=password-reset";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = (searchParams.get("email") ?? "").trim();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const codeDigits = useMemo(() => code.replace(/\D/g, ""), [code]);
  const passwordStrong = useMemo(() => isStrongPassword(password), [password]);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const showPolicyHint = password.length > 0 && !passwordStrong;
  const showMatchHint = confirm.length > 0 && !passwordsMatch;
  const canSubmit =
    Boolean(email) && codeDigits.length === 6 && passwordStrong && passwordsMatch && !isLoading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await resetPasswordWithCode(email, codeDigits, password);
      setSubmitted(true);
      setTimeout(() => router.replace(LOGIN_AFTER_RESET), 2200);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage("That code is invalid or has expired. Request a new one below.");
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
            {email
              ? `Enter the 6-digit code we sent to ${email} and choose a new password.`
              : "Choose a new password for your account."}
          </p>
        </div>

        {submitted ? (
          <div className="mt-10 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 sm:text-base">
            Your password has been reset. Redirecting you to login…
          </div>
        ) : !email ? (
          <div className="mt-10 w-full">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 sm:text-base">
              Start the reset from the forgot-password page so we know which account to recover.
            </div>
            <div className="mt-6 text-center text-sm sm:text-base">
              <Link
                href="/forgot-password"
                className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
              >
                Request a reset code
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 flex w-full flex-col gap-4">
            <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full bg-transparent text-sm font-medium tracking-[0.4em] text-rf-text placeholder:tracking-normal placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              />
            </label>

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

            <div className="text-center text-sm sm:text-base">
              <Link
                href="/forgot-password"
                className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
              >
                Request a new code
              </Link>
            </div>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
