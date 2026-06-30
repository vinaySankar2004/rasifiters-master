"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { deleteAccount as deleteAccountApi } from "@/lib/api/auth";
import { fetchMemberProfile, updateMemberProfile, type MemberProfile } from "@/lib/api/members";
import { initials } from "@/lib/format";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;

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
            <label className="text-sm font-semibold text-rf-text">Gender</label>
            <select
              value={gender}
              onChange={(event) => {
                setGender(event.target.value);
                markEdited();
              }}
              className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
            >
              <option value="">Select gender</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
