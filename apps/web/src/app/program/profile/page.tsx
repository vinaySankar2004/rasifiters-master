"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  AUTH_COPY,
  deleteAccount as deleteAccountApi,
  changeEmail as changeEmailApi,
  isPasswordWriteUnconfirmed,
  isSamePasswordError,
  listIdentities,
  linkGoogle as linkGoogleApi,
  unlinkProvider as unlinkProviderApi,
  setPassword as setPasswordApi,
  type IdentitiesResponse
} from "@/lib/api/auth";
import { credentialErrorMessage, toAppError } from "@/lib/kit/app-error";
import { fetchMemberProfile, updateMemberProfile, type MemberProfile } from "@/lib/api/members";
import { initials } from "@/lib/format";
import { GENDER_OPTIONS } from "@/lib/genders";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/Select";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Same loose, deliberately-permissive email regex as the create-account / forgot-password pages.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfilePage() {
  const router = useRouter();
  const { session, program, token } = useAuthGuard({ requireProgram: false });
  const { updateUser, signOut, signOutEverywhere } = useAuth();
  const queryClient = useQueryClient();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const roleLabel = isGlobalAdmin
    ? "Global Admin"
    : program?.my_role === "admin"
      ? "Program Admin"
      : "Member";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const normalizedGender = gender.trim();

  // Email change (net-new): direct, password-confirmed. Its own state + messages so it doesn't collide
  // with the name/gender Save flow above.
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Sign-in methods (auth phase-2). Password policy mirror of the backend validatePassword.
  const [pwError, setPwError] = useState<string | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const pwUnconfirmedRef = useRef<string | null>(null);
  const [showSignOutAll, setShowSignOutAll] = useState(false);
  const [signOutAllError, setSignOutAllError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["account", "profile", session?.user.id],
    queryFn: () => fetchMemberProfile(token, session?.user.id ?? ""),
    enabled: !!token && !!session?.user.id
  });

  const identitiesQuery = useQuery({
    queryKey: ["account", "identities", session?.user.id],
    queryFn: () => listIdentities(token),
    enabled: !!token && !!session?.user.id
  });

  const applyIdentities = (data: IdentitiesResponse) => {
    if (session?.user.id) {
      queryClient.setQueryData(["account", "identities", session.user.id], {
        identities: data.identities, has_password: data.has_password
      });
    }
  };

  const linkGoogleMutation = useMutation({
    mutationFn: (code: string) => linkGoogleApi(token, code),
    onSuccess: (data) => { setLinkError(null); applyIdentities(data); },
    onError: (e) => setLinkError(credentialErrorMessage(e, "account"))
  });

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) => unlinkProviderApi(token, provider),
    onSuccess: (data) => { setLinkError(null); applyIdentities(data); },
    onError: (e) => setLinkError(credentialErrorMessage(e, "account"))
  });

  // auth §3.1 rules 4 + 6 (same handling as /program/password).
  const passwordSetDone = () => {
    pwUnconfirmedRef.current = null;
    setPwError(null);
    setShowPwForm(false);
    setNewPassword("");
    setPwSuccess(true);
  };

  const setPasswordMutation = useMutation({
    mutationFn: (password: string) => setPasswordApi(token, password),
    onSuccess: (data) => { passwordSetDone(); applyIdentities(data); },
    onError: (e, password) => {
      if (pwUnconfirmedRef.current === password && isSamePasswordError(e)) {
        passwordSetDone();
        void identitiesQuery.refetch();
        return;
      }
      if (isPasswordWriteUnconfirmed(e)) {
        pwUnconfirmedRef.current = password;
        setPwError(AUTH_COPY.passwordUnconfirmed);
        // The refetch can prove it landed (has_password) — then the form closes and the success copy shows.
        void identitiesQuery.refetch().then((result) => {
          if (result.data?.has_password && pwUnconfirmedRef.current === password) passwordSetDone();
        });
        return;
      }
      setPwError(credentialErrorMessage(e, "account"));
    }
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    const fullName = profileQuery.data.member_name ?? session?.user.memberName ?? "";
    const parts = fullName.split(" ").filter(Boolean);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" ") ?? "");
    setGender(profileQuery.data.gender ?? "");
  }, [profileQuery.data, session?.user.memberName]);

  // D-C2: clear a stale success/error message as soon as the user edits a field, so a prior
  // "Profile updated successfully." doesn't linger over freshly-edited-but-unsaved fields.
  // Legacy only cleared these at the next Save click.
  const markEdited = () => {
    if (showSuccess) setShowSuccess(false);
    if (errorMessage) setErrorMessage(null);
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      updateMemberProfile(token, session?.user.id ?? "", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender: normalizedGender.length > 0 ? normalizedGender : null
      }),
    onSuccess: (data) => {
      setShowSuccess(true);
      setGender(normalizedGender);
      if (session) {
        const updatedName = data.member_name ?? `${firstName.trim()} ${lastName.trim()}`.trim();
        queryClient.setQueryData<MemberProfile | undefined>(
          ["account", "profile", session.user.id],
          (previous) =>
            previous
              ? {
                  ...previous,
                  member_name: updatedName,
                  gender: normalizedGender.length > 0 ? normalizedGender : null
                }
              : previous
        );
        updateUser({ memberName: updatedName });
      }
    },
    onError: (error) => {
      setErrorMessage(toAppError(error).message);
    }
  });

  const emailMutation = useMutation({
    mutationFn: () => changeEmailApi(token, newEmail.trim(), emailPassword),
    onSuccess: () => {
      setEmailSuccess(true);
      setShowEmailForm(false);
      setNewEmail("");
      setEmailPassword("");
      if (session?.user.id) {
        queryClient.invalidateQueries({ queryKey: ["account", "profile", session.user.id] });
      }
    },
    onError: (error) => {
      setEmailError(credentialErrorMessage(error, "account"));
    }
  });

  // Delete keeps signOut(): the full teardown (its best-effort /logout is ignored).
  const deleteMutation = useMutation({
    mutationFn: () => deleteAccountApi(token),
    onSuccess: async () => {
      await signOut();
      router.push("/login");
    },
    onError: (error) => {
      setErrorMessage(toAppError(error).message);
    }
  });

  const signOutAllMutation = useMutation({
    mutationFn: () => signOutEverywhere(),
    onSuccess: () => router.push("/login"),
    onError: (error) => setSignOutAllError(toAppError(error).message)
  });

  const userInitials = useMemo(() => {
    const name = `${firstName} ${lastName}`.trim() || session?.user.memberName || session?.user.username || "U";
    return initials(name);
  }, [firstName, lastName, session?.user.memberName, session?.user.username]);

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && !updateMutation.isPending;
  const canSubmitEmail =
    EMAIL_RE.test(newEmail.trim()) && emailPassword.length > 0 && !emailMutation.isPending;

  const identities = identitiesQuery.data?.identities ?? [];
  const hasGoogle = identities.some((i) => i.provider === "google");
  const hasPassword = identitiesQuery.data?.has_password ?? true;
  const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
  const canSubmitPassword = PW_RE.test(newPassword) && !setPasswordMutation.isPending;

  return (
    <>
      <PageShell maxWidth="3xl">
        <PageHeader title="My Profile" backHref={program?.id ? "/program" : "/programs"} />

        <GlassCard padding="lg" className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-600">
              {userInitials}
            </div>
            <div>
              <p className="text-lg font-semibold text-rf-text">
                {`${firstName} ${lastName}`.trim() || session?.user.memberName}
              </p>
              <p className="text-sm text-rf-text-muted">@{session?.user.username ?? ""}</p>
              <p className="text-xs font-semibold text-amber-600">{roleLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-rf-text">First name</label>
              <input
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  markEdited();
                }}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                placeholder="First name"
                autoComplete="given-name"
                autoCapitalize="words"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-rf-text">Last name</label>
              <input
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  markEdited();
                }}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                placeholder="Last name"
                autoComplete="family-name"
                autoCapitalize="words"
              />
            </div>
          </div>

          <div>
            <Select
              label="Gender"
              value={gender}
              options={[...GENDER_OPTIONS]}
              placeholder="Select gender"
              onChange={(value) => {
                setGender(value);
                markEdited();
              }}
            />
          </div>

          {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}
          {showSuccess && (
            <p className="text-sm font-semibold text-rf-success">Profile updated successfully.</p>
          )}

          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              setErrorMessage(null);
              setShowSuccess(false);
              updateMutation.mutate();
            }}
            className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save changes"}
          </button>

          <div className="space-y-3 border-t border-rf-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rf-text">Email</p>
                <p className="truncate text-sm text-rf-text-muted">
                  {profileQuery.data?.email ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm((prev) => !prev);
                  setEmailError(null);
                  setEmailSuccess(false);
                  setNewEmail("");
                  setEmailPassword("");
                }}
                className="shrink-0 rounded-2xl border border-rf-border px-4 py-2 text-sm font-semibold text-rf-text"
              >
                {showEmailForm ? "Cancel" : "Change email"}
              </button>
            </div>

            {emailSuccess && (
              <p className="text-sm font-semibold text-rf-success">Email updated successfully.</p>
            )}

            {showEmailForm && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-rf-text">New email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(event) => {
                      setNewEmail(event.target.value);
                      if (emailError) setEmailError(null);
                      if (emailSuccess) setEmailSuccess(false);
                    }}
                    className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-rf-text">Current password</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(event) => {
                      setEmailPassword(event.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
                    placeholder="Current password"
                    autoComplete="current-password"
                  />
                </div>

                {emailError && <p className="text-sm font-semibold text-rf-danger">{emailError}</p>}

                <button
                  type="button"
                  disabled={!canSubmitEmail}
                  onClick={() => {
                    setEmailError(null);
                    setEmailSuccess(false);
                    emailMutation.mutate();
                  }}
                  className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {emailMutation.isPending ? "Updating..." : "Update email"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-rf-border pt-4">
            <p className="text-sm font-semibold text-rf-text">Sign-in methods</p>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-rf-text">Google</p>
                <p className="truncate text-sm text-rf-text-muted">
                  {hasGoogle ? (identities.find((i) => i.provider === "google")?.email ?? "Linked") : "Not linked"}
                </p>
              </div>
              {hasGoogle ? (
                <button
                  type="button"
                  disabled={identities.length <= 1 || unlinkMutation.isPending}
                  onClick={() => { setLinkError(null); unlinkMutation.mutate("google"); }}
                  className="shrink-0 rounded-2xl border border-rf-border px-4 py-2 text-sm font-semibold text-rf-text disabled:opacity-50"
                >
                  Unlink
                </button>
              ) : (
                <GoogleSignInButton
                  compact
                  disabled={linkGoogleMutation.isPending}
                  onCode={(code) => { setLinkError(null); linkGoogleMutation.mutate(code); }}
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-rf-text">Password</p>
                <p className="truncate text-sm text-rf-text-muted">{hasPassword ? "Enabled" : "Not set"}</p>
              </div>
              {!hasPassword && (
                <button
                  type="button"
                  onClick={() => { setShowPwForm((p) => !p); setPwError(null); setPwSuccess(false); setNewPassword(""); }}
                  className="shrink-0 rounded-2xl border border-rf-border px-4 py-2 text-sm font-semibold text-rf-text"
                >
                  {showPwForm ? "Cancel" : "Add password"}
                </button>
              )}
            </div>

            {showPwForm && !hasPassword && (
              <div className="space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); if (pwError) setPwError(null); }}
                  className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
                  placeholder="New password"
                  autoComplete="new-password"
                />
                <p className="text-xs text-rf-text-muted">At least 8 characters with an uppercase, a lowercase, and a number.</p>
                <button
                  type="button"
                  disabled={!canSubmitPassword}
                  onClick={() => { setPwError(null); setPasswordMutation.mutate(newPassword); }}
                  className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {setPasswordMutation.isPending ? "Saving..." : "Save password"}
                </button>
              </div>
            )}

            {linkError && <p className="text-sm font-semibold text-rf-danger">{linkError}</p>}
            {pwError && <p className="text-sm font-semibold text-rf-danger">{pwError}</p>}
            {pwSuccess && <p className="text-sm font-semibold text-rf-success">{AUTH_COPY.passwordSet}</p>}
          </div>

          <div className="border-t border-rf-border pt-4">
            <button
              type="button"
              disabled={signOutAllMutation.isPending}
              onClick={() => { setSignOutAllError(null); setShowSignOutAll(true); }}
              className="w-full rounded-2xl border border-rf-border px-4 py-3 text-sm font-semibold text-rf-text disabled:opacity-50"
            >
              {signOutAllMutation.isPending ? AUTH_COPY.signingOut : AUTH_COPY.signOutEverywhere}
            </button>
            <p className="mt-2 text-xs text-rf-text-muted">{AUTH_COPY.signOutEverywhereHint}</p>
            {signOutAllError && <p className="mt-2 text-sm font-semibold text-rf-danger">{signOutAllError}</p>}
          </div>

          {!isGlobalAdmin && (
            <div className="pt-4 border-t border-rf-border">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full rounded-2xl border border-rf-danger px-4 py-3 text-sm font-semibold text-rf-danger"
              >
                Delete Account
              </button>
              <p className="mt-2 text-xs text-rf-text-muted">
                This will permanently delete your account and all associated data.
              </p>
            </div>
          )}
        </GlassCard>
      </PageShell>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Account?"
        description="This action cannot be undone. All your data, including workout logs, health logs, and program memberships will be permanently deleted."
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        danger
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showSignOutAll}
        title={AUTH_COPY.signOutEverywhereTitle}
        description={AUTH_COPY.signOutEverywhereBody}
        confirmLabel={AUTH_COPY.signOutEverywhere}
        danger
        onConfirm={() => signOutAllMutation.mutate()}
        onClose={() => setShowSignOutAll(false)}
      />
    </>
  );
}
