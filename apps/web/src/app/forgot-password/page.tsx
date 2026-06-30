"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { requestPasswordReset } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import { SUPPORT_EMAIL } from "@/lib/config";

// NET-NEW page (no legacy reference) — the first step of the Supabase-Auth self-service recovery path,
// reached from the login page's "Forgot your password?" link. See specs/pages/web/forgot-password/SPEC.md.
//
// Design (D-PLAN, login SPEC): ALWAYS-send (privacy-safe — the backend never reveals whether the email
// maps to an account) + an ALWAYS-visible "No email on your account? Contact us" mailto fallback for the
// migrated placeholder (no-email) accounts. The field is email-only, so it does inline format validation
// (unlike login's username-or-email identifier). The reset itself runs through the Express backend (R1).

// Inline email-format validation (the page is email-only). Loose, deliberately permissive.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "RaSi Fiters — account recovery help"
)}`;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { session, isBootstrapping } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const isValidEmail = useMemo(() => EMAIL_RE.test(trimmedEmail), [trimmedEmail]);
  // Show the format hint only once the user has typed something that isn't yet a valid email.
  const showFormatHint = trimmedEmail.length > 0 && !isValidEmail;
  const canSubmit = isValidEmail && !isLoading;

  // Consistent with splash/login: an already-authenticated visitor is sent to /programs.
  useEffect(() => {
    if (!isBootstrapping && session) {
      router.replace("/programs");
    }
  }, [isBootstrapping, session, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await requestPasswordReset(trimmedEmail);
      // Always proceed to the code step regardless of whether the email exists (no enumeration) — the
      // email is carried so the user only types the code + new password next.
      router.push(`/reset-password?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (error) {
      // A genuine failure (network / 500) isn't account-existence info — surface a neutral retry message
      // and keep the contact fallback below prominent.
      const message =
        error instanceof Error
          ? "We couldn't send the reset email just now. Please try again, or contact us below."
          : "Something went wrong. Please try again, or contact us below.";
      setErrorMessage(message);
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
          <h1 className="text-2xl font-semibold text-rf-text sm:text-3xl">Reset your password</h1>
          <p className="mt-2 text-sm font-semibold text-rf-text-muted sm:text-base">
            Enter your email and we&apos;ll send you a code to reset it.
          </p>
        </div>

        {(
          <form onSubmit={handleSubmit} className="mt-10 flex w-full flex-col gap-4">
            <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
              <input
                type="email"
                inputMode="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                autoComplete="email"
              />
            </label>

            {showFormatHint && (
              <p className="px-1 text-xs font-semibold text-rf-text-muted sm:text-sm">
                Enter a valid email address.
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
              {isLoading ? "Sending..." : "Send reset code"}
            </button>
          </form>
        )}

        {/*
          ALWAYS-visible contact fallback — for the migrated placeholder (no-email) accounts that can't
          receive a reset email at all. Shown in both the form and the submitted state (D-PLAN).
        */}
        <div className="mt-6 w-full rounded-2xl border border-rf-border bg-rf-surface px-4 py-3 text-center text-sm text-rf-text-muted sm:text-base">
          <span>No email on your account? </span>
          <Link
            href={SUPPORT_MAILTO}
            className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Contact us
          </Link>
          <span> and we&apos;ll help you get back in.</span>
        </div>

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
