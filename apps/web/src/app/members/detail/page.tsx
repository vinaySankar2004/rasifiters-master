"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMembershipDetails, removeMembership, updateMembership } from "@/lib/api/programs";
import { appError, toAppError } from "@/lib/kit/app-error";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { initials } from "@/lib/format";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { ErrorView } from "@/components/kit/ErrorView";
import { QueryView } from "@/components/kit/QueryView";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function MemberDetailPage() {
  const router = useRouter();
  const searchParams = useClientSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  // The search params are empty on the first render (and in the static HTML): judge "no member id" only after mount.
  const [paramsReady, setParamsReady] = useState(false);
  useEffect(() => setParamsReady(true), []);
  const { session, token, programId, isBootstrapping } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";

  const [joinedAt, setJoinedAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
    if (!isGlobalAdmin) {
      router.push("/members");
    }
  }, [isBootstrapping, session, isGlobalAdmin, router]);

  const detailsKey = ["members", "details", programId];
  const membersQuery = useQuery({
    queryKey: detailsKey,
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
  }, [member]);

  const handleSave = async () => {
    if (!member) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateMembership(token, {
        program_id: programId,
        member_id: member.member_id,
        // polish #11 (program-memberships: Active toggle retired): only joined_at; the server still accepts
        // is_active from live binaries.
        joined_at: joinedAt || null
      });
      router.push("/members/list");
    } catch (error) {
      setErrorMessage(toAppError(error).message);
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
      setErrorMessage(toAppError(error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title="Member Details" backHref="/members/list" />

      {paramsReady && !memberId && <ErrorView error={appError("notFound")} />}

      <QueryView query={membersQuery} queryKey={detailsKey} loadingMessage="Loading member...">
        {member ? (
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
        ) : memberId ? (
          <ErrorView error={appError("notFound")} />
        ) : null}
      </QueryView>

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
