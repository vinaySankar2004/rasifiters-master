"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark } from "@/components/BrandMark";
import { login } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import { decodeJwtPayload, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";
import { PRIVACY_POLICY_URL } from "@/lib/config";
import { useClientSearchParams } from "@/lib/use-client-search-params";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useClientSearchParams();
  const { setSession, session, isBootstrapping } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => identifier.trim().length > 0 && password.trim().length > 0,
    [identifier, password]
  );

  const redirectReason = searchParams.get("reason");
  // `password-reset` lands here from the recovery flow (reset-password page) — a positive confirmation,
  // not a session-loss warning; the others are the middleware session-loss redirects.
  const passwordWasReset = redirectReason === "password-reset";
  const showSessionMessage =
    redirectReason === "expired" || redirectReason === "invalid" || passwordWasReset;
  const sessionMessage =
    redirectReason === "expired"
      ? "Your session expired. Please sign in again."
      : redirectReason === "invalid"
        ? "We could not verify your session. Please sign in again."
        : "Your password has been reset. Sign in with your new password.";

  useEffect(() => {
    if (!isBootstrapping && session) {
      router.replace("/programs");
    }
  }, [isBootstrapping, session, router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await login(identifier.trim(), password);
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
        error instanceof Error ? error.message : "Unable to login. Try again.";
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
          <h1 className="text-2xl font-semibold text-rf-text sm:text-3xl">Welcome Back</h1>
          <p className="mt-2 text-sm font-semibold text-rf-text-muted sm:text-base">
            Login to access your fitness dashboard
          </p>
        </div>

        {showSessionMessage && (
          <div
            className={`mt-6 w-full rounded-2xl border px-4 py-3 text-sm font-semibold ${
              passwordWasReset
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {sessionMessage}
          </div>
        )}

        <form
          onSubmit={handleLogin}
          className="mt-10 flex w-full flex-col gap-4"
        >
          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type="text"
              placeholder="Username or Email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>

          <label className="input-shell flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-rf-text placeholder:text-rf-text-muted focus:outline-none sm:text-base"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-xs font-semibold text-rf-text-muted transition hover:text-rf-text sm:text-sm"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </label>

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
            {isLoading ? "Signing in..." : "Login"}
          </button>
        </form>

        {/*
          Migration addition (not in legacy): the entry point to the new Supabase-Auth
          self-service recovery path. Target page /forgot-password is built in the
          immediate follow-up port. See specs/pages/web/login/SPEC.md §9 D-C1 / §10.
        */}
        <div className="mt-4 text-center text-sm sm:text-base">
          <Link
            href="/forgot-password"
            className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Forgot your password?
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-2 text-sm text-rf-text-muted sm:text-base">
          <span>New here?</span>
          <Link
            href="/create-account"
            className="font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Create an account
          </Link>
        </div>

        <div className="mt-8 text-center text-xs text-rf-text-muted sm:text-sm">
          <p>Training hard? Login to track your progress.</p>
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
