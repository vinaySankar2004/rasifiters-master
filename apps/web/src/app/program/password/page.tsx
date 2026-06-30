"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { changePassword } from "@/lib/api/auth";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";

// The signed-in user's OWN change-password page — the 4th of the 6 deferred /program/* settings sub-routes.
// Despite living under /program/* it is NOT a program-admin setting (no admin redirect; every role); it's a
// near-twin of the /reset-password recovery form minus the URL-fragment token. See
// specs/pages/web/program/password/SPEC.md.

export default function ChangePasswordPage() {
  // D-C2: reuse the foundation guard (requireProgram:false) over the legacy inline useAuth + manual redirect.
  const { session, program, token } = useAuthGuard({ requireProgram: false });
  const fallbackHref = program?.id ? "/program" : "/programs";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validation = useMemo(() => validatePassword(newPassword, confirmPassword), [newPassword, confirmPassword]);

  // D-C3: clear a stale success/error message as soon as the user edits a field, so a prior
  // "Password updated successfully." doesn't linger over the cleared fields. Legacy only cleared
  // these at the next Update click.
  const markEdited = () => {
    if (successMessage) setSuccessMessage(null);
    if (errorMessage) setErrorMessage(null);
  };

  const mutation = useMutation({
    mutationFn: () => changePassword(token, newPassword),
    onSuccess: () => {
      setSuccessMessage("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update password.");
    }
  });

  const canSubmit = validation.isValid && !mutation.isPending;

  // useAuthGuard already redirects a tokenless visitor to /login; render nothing meanwhile.
  if (!session?.token) return null;

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="Change Password"
        subtitle="Enter a new password for your account."
        backHref={fallbackHref}
      />

      <GlassCard padding="lg" className="space-y-5">
        <div>
          <label className="text-sm font-semibold text-rf-text">New password</label>
          <div className="input-shell mt-2 flex items-center gap-2 rounded-2xl px-4 py-3">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                markEdited();
              }}
              placeholder="••••••••"
              className="w-full bg-transparent text-sm font-medium outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="text-xs font-semibold text-rf-text-muted"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-rf-text">Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              markEdited();
            }}
            placeholder="••••••••"
            className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>

        {/* D-C1: tokenize the met-rule color text-emerald-600 -> text-rf-success (theme-aware). */}
        <div className="space-y-1 text-xs text-rf-text-muted">
          <p className={validation.hasLength ? "text-rf-success" : ""}>• At least 8 characters</p>
          <p className={validation.hasUpper ? "text-rf-success" : ""}>• One uppercase letter</p>
          <p className={validation.hasLower ? "text-rf-success" : ""}>• One lowercase letter</p>
          <p className={validation.hasNumber ? "text-rf-success" : ""}>• One number</p>
          <p className={validation.matches ? "text-rf-success" : ""}>• Passwords match</p>
        </div>

        {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}
        {successMessage && <p className="text-sm font-semibold text-rf-success">{successMessage}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
            mutation.mutate();
          }}
          className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {mutation.isPending ? "Updating..." : "Update Password"}
        </button>
      </GlassCard>
    </PageShell>
  );
}

function validatePassword(password: string, confirm: string) {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const matches = password.length > 0 && password === confirm;
  return {
    hasLength,
    hasUpper,
    hasLower,
    hasNumber,
    matches,
    isValid: hasLength && hasUpper && hasLower && hasNumber && matches
  };
}
