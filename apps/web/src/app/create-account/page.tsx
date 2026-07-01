"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { Select } from "@/components/Select";
import { GENDER_OPTIONS } from "@/lib/genders";
import { login, registerAccount } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import { decodeJwtPayload, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";
import { PRIVACY_POLICY_URL } from "@/lib/config";

// Faithful port of the legacy web create-account page
// (rasifiters-webapp/src/app/create-account/page.tsx) with the auth-recovery-plan
// deviations + sign-off cleanups. See specs/pages/web/create-account/SPEC.md.
//
// Deviations from legacy (all decided in question-asker run 19):
//   D-C1  Inline email-format validation (legacy had only non-empty + type="email") — D-PLAN item 3,
//         mirrors the forgot-password regex.
//   D-C2  Already-authenticated visitors are redirected to /programs (legacy had no redirect) — matches
//         the sibling auth pages (login/forgot/reset).
//   D-C3  Live password-policy checklist (✓/✗ per rule) replacing legacy's static hint line.
//   D-C4  Muted confirm-mismatch hint (matches reset-password) instead of legacy's red text.
//   D-C5  autoFocus the First Name field.

// Inline email-format validation — same loose, deliberately-permissive regex as forgot-password (D-C1).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateAccountPage() {
  const router = useRouter();
  const { session, isBootstrapping, setSession } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Consistent with splash/login/forgot/reset: an already-authenticated visitor is sent to /programs (D-C2).
  useEffect(() => {
    if (!isBootstrapping && session) {
      router.replace("/programs");
    }
  }, [isBootstrapping, session, router]);

  // Live password-policy checks — mirror the server policy (authService.validatePassword) (D-C3).
  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password)
    }),
    [password]
  );
  const passwordMeetsPolicy =
    passwordChecks.length && passwordChecks.upper && passwordChecks.lower && passwordChecks.number;

  const trimmedEmail = email.trim();
  const isValidEmail = useMemo(() => EMAIL_RE.test(trimmedEmail), [trimmedEmail]);
  // Show the email format hint only once the user has typed something that isn't yet a valid email (D-C1).
  const showEmailHint = trimmedEmail.length > 0 && !isValidEmail;

  const canSubmit = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      username.trim().length > 0 &&
      isValidEmail &&
      passwordMeetsPolicy &&
      password === confirmPassword
    );
  }, [firstName, lastName, username, isValidEmail, passwordMeetsPolicy, password, confirmPassword]);

  const handleCreateAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        email: trimmedEmail,
        password,
        ...(gender.trim().length > 0 ? { gender: gender.trim() } : {})
      };

      await registerAccount(payload);

      // The backend register returns no session token (auth SPEC §3), so sign in immediately with the
      // just-created credentials — faithful to legacy (auto-login → /programs).
      const response = await login(username.trim(), password);
      const decoded = decodeJwtPayload<DecodedAuthToken>(response.token);
      const resolvedGlobalRole = resolveGlobalRole({
        tokenGlobalRole: decoded?.global_role,
        tokenRole: decoded?.role,
        responseGlobalRole: response.global_role,
        responseRole: (response as { role?: string }).role
      });
      const nextSession = {
        token: response.token,
        refreshToken: response.refresh_token,
        user: {
          id: decoded?.id ?? response.member_id,
          username: decoded?.username ?? response.username,
          memberName: decoded?.member_name ?? response.member_name,
          globalRole: resolvedGlobalRole
        }
      };
      setSession(nextSession);
      router.push("/programs");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create account. Try again.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const showMismatch = confirmPassword.length > 0 && confirmPassword !== password;

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
          <h1 className="text-2xl font-semibold text-rf-text sm:text-3xl">Create Account</h1>
          <p className="mt-2 text-sm font-semibold text-rf-text-muted sm:text-base">
            Start tracking your fitness journey
          </p>
        </div>

        <form onSubmit={handleCreateAccount} className="mt-10 flex w-full flex-col gap-4">
          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="given-name"
              autoFocus
            />
          </label>

          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="family-name"
            />
          </label>

          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="username"
            />
          </label>

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

          {showEmailHint && (
            <p className="px-1 text-xs font-semibold text-rf-text-muted sm:text-sm">
              Enter a valid email address.
            </p>
          )}

          <Select
            value={gender}
            options={[...GENDER_OPTIONS]}
            onChange={setGender}
            placeholder="Gender (optional)"
            className="w-full"
          />

          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
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
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="text-xs font-semibold text-rf-text-muted transition hover:text-rf-text sm:text-sm"
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </label>

          {/* Live password-policy checklist — appears once the user starts typing (D-C3). */}
          {password.length > 0 && (
            <ul className="space-y-1 px-1 text-xs font-semibold sm:text-sm">
              <PolicyItem met={passwordChecks.length}>At least 8 characters</PolicyItem>
              <PolicyItem met={passwordChecks.upper}>An uppercase letter</PolicyItem>
              <PolicyItem met={passwordChecks.lower}>A lowercase letter</PolicyItem>
              <PolicyItem met={passwordChecks.number}>A number</PolicyItem>
            </ul>
          )}

          {showMismatch && (
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
            disabled={!canSubmit || isLoading}
            className="button-primary button-primary--dark-white mt-2 inline-flex min-h-[50px] items-center justify-center rounded-full px-8 text-base font-semibold"
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-2 text-sm text-rf-text-muted sm:text-base">
          <span>Already have an account?</span>
          <Link
            href="/login"
            className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-8 text-center text-xs text-rf-text-muted sm:text-sm">
          <p>By creating an account, you accept our</p>
          <Link
            href={PRIVACY_POLICY_URL}
            className="mt-1 inline-block font-semibold text-rf-accent"
          >
            Privacy Policy
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function PolicyItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li
      className={`flex items-center gap-2 transition ${
        met ? "text-emerald-600" : "text-rf-text-muted"
      }`}
    >
      <span aria-hidden>{met ? "✓" : "○"}</span>
      <span>{children}</span>
    </li>
  );
}
