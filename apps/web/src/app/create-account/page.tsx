"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { Select } from "@/components/Select";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GENDER_OPTIONS } from "@/lib/genders";
import {
  login,
  registerAccount,
  socialSignIn,
  completeSocialRegistration,
  type LoginResponse
} from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import { decodeJwtPayload, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";
import { GOOGLE_WEB_CLIENT_ID, PRIVACY_POLICY_URL } from "@/lib/config";
import { useClientSearchParams } from "@/lib/use-client-search-params";

// Faithful port of the legacy web create-account page with the auth-recovery deviations, plus the
// federated-sign-in restructure (auth v0.7.0): the single form becomes a local 3-step wizard, and a
// "Continue with Google" branch adds a 2-step social sign-up. See specs/pages/web/create-account/SPEC.md.
//
// Deviations (D-C1…D-C5 as before) + D-C6 3-step wizard · D-C7 social sign-up branch (locked email,
// no password) · D-C8 "Continue with Google" button.

// Inline email-format validation — same loose, deliberately-permissive regex as forgot-password (D-C1).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateAccountPage() {
  const router = useRouter();
  const searchParams = useClientSearchParams();
  const { session, isBootstrapping, setSession } = useAuth();

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"email" | "social">("email");
  const [pendingToken, setPendingToken] = useState("");
  const [pendingRefresh, setPendingRefresh] = useState("");
  const [lockedEmail, setLockedEmail] = useState("");

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

  // Social entry (D-C7): the login page stashed a pending Supabase session for a brand-new Google user and
  // sent us here with ?social=1. Adopt it as the social branch (locked email, prefilled names), then clear.
  useEffect(() => {
    if (searchParams.get("social") !== "1") return;
    try {
      const raw = sessionStorage.getItem("rf_pending_social");
      if (raw) {
        const p = JSON.parse(raw) as {
          token?: string;
          refresh_token?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
        };
        setMode("social");
        setPendingToken(p.token ?? "");
        setPendingRefresh(p.refresh_token ?? "");
        setLockedEmail(p.email ?? "");
        setEmail(p.email ?? "");
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
        setStep(1);
      }
    } catch {
      // ignore malformed stash
    }
    sessionStorage.removeItem("rf_pending_social");
  }, [searchParams]);

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
  const showEmailHint = mode === "email" && trimmedEmail.length > 0 && !isValidEmail;
  const showMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const totalSteps = mode === "social" ? 2 : 3;
  const isFinalStep = step === totalSteps;

  const canContinue = useMemo(() => {
    if (step === 1) return firstName.trim().length > 0 && lastName.trim().length > 0;
    if (step === 2) return username.trim().length > 0 && isValidEmail;
    return passwordMeetsPolicy && password === confirmPassword;
  }, [step, firstName, lastName, username, isValidEmail, passwordMeetsPolicy, password, confirmPassword]);

  // Build the session from any AuthResponse-shaped payload (email login, social complete, or a returning
  // Google user) and route to /programs — identical to the login page (F1: client-side JWT decode only).
  const applyLogin = useCallback(
    (response: LoginResponse) => {
      const decoded = decodeJwtPayload<DecodedAuthToken>(response.token);
      const resolvedGlobalRole = resolveGlobalRole({
        tokenGlobalRole: decoded?.global_role,
        tokenRole: decoded?.role,
        responseGlobalRole: response.global_role,
        responseRole: (response as { role?: string }).role
      });
      setSession({
        token: response.token,
        refreshToken: response.refresh_token,
        user: {
          id: decoded?.id ?? response.member_id,
          username: decoded?.username ?? response.username,
          memberName: decoded?.member_name ?? response.member_name,
          globalRole: resolvedGlobalRole
        }
      });
      router.push("/programs");
    },
    [router, setSession]
  );

  // Google (D-C8): the GSI callback yields an ID token → backend /auth/oauth exchange. Existing member →
  // straight into the session; brand-new social user → switch to the social branch to finish the profile.
  // useCallback keeps the identity stable across keystroke re-renders so GoogleSignInButton doesn't re-init GSI.
  const handleGoogle = useCallback(
    async (code: string) => {
      if (isLoading) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const r = await socialSignIn({ provider: "google", code });
        if (r.needs_profile) {
          setMode("social");
          setPendingToken(r.token ?? "");
          setPendingRefresh(r.refresh_token ?? "");
          setLockedEmail(r.email ?? "");
          setEmail(r.email ?? "");
          setFirstName(r.first_name ?? "");
          setLastName(r.last_name ?? "");
          setStep(1);
        } else {
          applyLogin(r);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Google sign-in failed. Try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, applyLogin]
  );

  const submitEmail = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await registerAccount({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        email: trimmedEmail,
        password,
        ...(gender.trim().length > 0 ? { gender: gender.trim() } : {})
      });
      // register returns no session token (auth SPEC §3) — sign in immediately (faithful auto-login).
      const response = await login(username.trim(), password);
      applyLogin(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create account. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitSocial = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await completeSocialRegistration(pendingToken, {
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        refresh_token: pendingRefresh,
        ...(gender.trim().length > 0 ? { gender: gender.trim() } : {})
      });
      applyLogin(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to finish sign-up. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrimary = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading || !canContinue) return;
    if (!isFinalStep) {
      setErrorMessage(null);
      setStep((prev) => prev + 1);
      return;
    }
    if (mode === "email") await submitEmail();
    else await submitSocial();
  };

  const goBack = () => {
    setErrorMessage(null);
    setStep((prev) => Math.max(1, prev - 1));
  };

  const primaryLabel = isLoading
    ? "Creating account..."
    : isFinalStep
      ? "Create Account"
      : "Continue";

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

        {/* Step progress dots (D-C6): 3 for email sign-up, 2 for the social branch (name → username). */}
        <div className="mt-6 flex items-center gap-2" aria-hidden>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((dot) => (
            <span
              key={dot}
              className={`h-2 w-2 rounded-full transition ${
                dot <= step ? "bg-rf-accent" : "bg-rf-text-muted/40"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handlePrimary} className="mt-8 flex w-full flex-col gap-4">
          {step === 1 && (
            <>
              <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
                <input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                  autoComplete="given-name"
                  autoCapitalize="words"
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
                  autoCapitalize="words"
                />
              </label>

              {/* "Continue with Google" only on the email-mode entry step (D-C8); hidden until the id is set. */}
              {mode === "email" && GOOGLE_WEB_CLIENT_ID && (
                <>
                  <div className="my-1 flex items-center gap-3 text-xs font-semibold text-rf-text-muted">
                    <span className="h-px flex-1 bg-rf-text-muted/25" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-rf-text-muted/25" />
                  </div>
                  <GoogleSignInButton onCode={handleGoogle} disabled={isLoading} />
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
              </label>

              {/* Field order Username → Gender → Email matches iOS/Android (impl-adversary Finding 3). */}
              <Select
                value={gender}
                options={[...GENDER_OPTIONS]}
                onChange={setGender}
                placeholder="Gender (optional)"
                className="w-full"
              />

              <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
                <input
                  type="email"
                  inputMode="email"
                  placeholder="Email"
                  value={mode === "social" ? lockedEmail : email}
                  onChange={(event) => setEmail(event.target.value)}
                  readOnly={mode === "social"}
                  className={`w-full bg-transparent text-sm font-medium placeholder:text-rf-text-muted focus:outline-none sm:text-base ${
                    mode === "social" ? "text-rf-text-muted" : "text-rf-text"
                  }`}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>

              {showEmailHint && (
                <p className="px-1 text-xs font-semibold text-rf-text-muted sm:text-sm">
                  Enter a valid email address.
                </p>
              )}
            </>
          )}

          {step === 3 && mode === "email" && (
            <>
              <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
                  autoComplete="new-password"
                  autoFocus
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
            </>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {errorMessage}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={isLoading}
                className="input-shell inline-flex min-h-[50px] flex-1 items-center justify-center rounded-full px-6 text-base font-semibold text-rf-text"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={!canContinue || isLoading}
              className="button-primary button-primary--dark-white inline-flex min-h-[50px] flex-1 items-center justify-center rounded-full px-8 text-base font-semibold"
            >
              {primaryLabel}
            </button>
          </div>
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
