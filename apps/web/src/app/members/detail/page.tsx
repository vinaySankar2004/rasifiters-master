"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMembershipDetails, removeMembership, updateMembership } from "@/lib/api/programs";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { initials } from "@/lib/format";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function MemberDetailPage() {
  const router = useRouter();
  const searchParams = useClientSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  const { session, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";

  const [joinedAt, setJoinedAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    if (!isGlobalAdmin) {
      router.push("/members");
    }
  }, [isGlobalAdmin, router]);

  const membersQuery = useQuery({
    queryKey: ["members", "details", programId],
    queryFn: () => fetchMembershipDetails(token, programId),
    enabled: !!token && !!programId && !!memberId
  });

  const member = useMemo(() => {
    return membersQuery.data?.find(
      (item) => item.member_id === memberId && item.status === "active"
    ) ?? null;
  }, [membersQuery.data, memberId]);

  useEffect(() => {
    if (!member) return;
    setJoinedAt(member.joined_at ?? "");
    setIsActive(member.is_active ?? true);
  }, [member]);

  const handleSave = async () => {
    if (!member) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateMembership(token, {
        program_id: programId,
        member_id: member.member_id,
        joined_at: joinedAt || null,
        is_active: isActive
      });
      router.push("/members/list");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!member) return;
    setShowRemoveConfirm(false);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await removeMembership(token, { program_id: programId, member_id: member.member_id });
      router.push("/members/list");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove member.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title="Member Details" backHref="/members/list" />

      {membersQuery.isLoading && <LoadingState message="Loading member..." />}

      {membersQuery.isError && <ErrorState message={(membersQuery.error as Error).message} />}

      {member && (
        <GlassCard padding="lg">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rf-surface-muted text-lg font-semibold">
              {initials(member.member_name)}
            </div>
            <div>
              <p className="text-lg font-semibold text-rf-text">{member.member_name}</p>
              <p className="text-sm text-rf-text-muted">@{member.username ?? ""}</p>
              {member.program_role === "admin" && (
                <p className="text-xs font-semibold text-rf-accent">Program Admin</p>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-rf-text-muted">
            {member.gender && <p>Gender: {member.gender}</p>}
            {member.date_joined && <p>Account Created: {member.date_joined}</p>}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-rf-text">Joined Program</label>
              <input
                type="date"
                value={joinedAt}
                onChange={(event) => {
                  setJoinedAt(event.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
              />
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold text-rf-text">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => {
                  setIsActive(event.target.checked);
                  if (errorMessage) setErrorMessage(null);
                }}
              />
              Active Membership
            </label>
          </div>

          {errorMessage && <p className="mt-4 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={isSaving}
              className="rounded-2xl bg-rf-danger/10 px-4 py-3 text-sm font-semibold text-rf-danger disabled:opacity-50"
            >
              Remove from program
            </button>
          </div>
        </GlassCard>
      )}

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove from program?"
        description={
          member ? `Remove ${member.member_name} from the program?` : "Remove this member from the program?"
        }
        confirmLabel={isSaving ? "Removing..." : "Remove"}
        danger
        loading={isSaving}
        onConfirm={handleRemove}
        onClose={() => setShowRemoveConfirm(false)}
      />
    </PageShell>
  );
}
