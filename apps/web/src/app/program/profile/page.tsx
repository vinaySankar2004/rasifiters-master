"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { deleteAccount as deleteAccountApi, changeEmail as changeEmailApi } from "@/lib/api/auth";
import { fetchMemberProfile, updateMemberProfile, type MemberProfile } from "@/lib/api/members";
import { initials } from "@/lib/format";
import { GENDER_OPTIONS } from "@/lib/genders";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/Select";

// Same loose, deliberately-permissive email regex as the create-account / forgot-password pages.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfilePage() {
  const router = useRouter();
  const { session, program, token } = useAuthGuard({ requireProgram: false });
  const { setSession, signOut } = useAuth();
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

  const profileQuery = useQuery({
    queryKey: ["account", "profile", session?.user.id],
    queryFn: () => fetchMemberProfile(token, session?.user.id ?? ""),
    enabled: !!token && !!session?.user.id
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
        setSession({
          ...session,
          user: {
            ...session.user,
            memberName: updatedName
          }
        });
      }
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save changes.");
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
      setEmailError(error instanceof Error ? error.message : "Unable to update email.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccountApi(token),
    onSuccess: async () => {
      await signOut();
      router.push("/login");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete account.");
    }
  });

  const userInitials = useMemo(() => {
    const name = `${firstName} ${lastName}`.trim() || session?.user.memberName || session?.user.username || "U";
    return initials(name);
  }, [firstName, lastName, session?.user.memberName, session?.user.username]);

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && !updateMutation.isPending;
  const canSubmitEmail =
    EMAIL_RE.test(newEmail.trim()) && emailPassword.length > 0 && !emailMutation.isPending;

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
    </>
  );
}
