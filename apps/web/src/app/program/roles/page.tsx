"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMembershipDetails, updateMembership, type MembershipDetail } from "@/lib/api/programs";
import { initials } from "@/lib/format";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export default function ManageRolesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || isGlobalAdmin;

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rolesQueryKey = useMemo(() => ["program", "roles", programId] as const, [programId]);

  useEffect(() => {
    if (program?.id && !isProgramAdmin) {
      router.push("/program");
    }
  }, [program?.id, isProgramAdmin, router]);

  const membersQuery = useQuery({
    queryKey: rolesQueryKey,
    queryFn: () => fetchMembershipDetails(token, programId),
    enabled: !!token && !!programId && isProgramAdmin
  });

  const activeMembers = useMemo(() => {
    return (membersQuery.data ?? []).filter((member) => member.status === "active");
  }, [membersQuery.data]);

  const activeAdminCount = useMemo(() => {
    return activeMembers.filter((member) => member.program_role === "admin").length;
  }, [activeMembers]);

  // D-C2 — optimistic role update: write the new role into the cache immediately so the ✓ moves at
  // once, then reconcile on settle; roll the cache back on error before surfacing the message.
  const updateMutation = useMutation({
    mutationFn: (payload: { memberId: string; role: string }) =>
      updateMembership(token, {
        program_id: programId,
        member_id: payload.memberId,
        role: payload.role
      }),
    onMutate: async (payload) => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: rolesQueryKey });
      const previous = queryClient.getQueryData<MembershipDetail[]>(rolesQueryKey);
      queryClient.setQueryData<MembershipDetail[]>(rolesQueryKey, (old) =>
        (old ?? []).map((member) =>
          member.member_id === payload.memberId ? { ...member, program_role: payload.role } : member
        )
      );
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(rolesQueryKey, context.previous);
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to update role.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["program", "membership-details", programId] });
      setUpdatingId(null);
    }
  });

  const handleRoleChange = (member: MembershipDetail, role: "admin" | "logger" | "member") => {
    // D-C3 — gate on the global in-flight flag (not just this row) so rapid cross-row clicks can't race.
    if (member.program_role === role || updateMutation.isPending) return;
    setUpdatingId(member.member_id);
    updateMutation.mutate({ memberId: member.member_id, role });
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title="Manage Roles"
        subtitle="Assign admin, logger, or member roles."
        backHref="/program"
      />

      {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      {membersQuery.isLoading && <LoadingState message="Loading roles..." />}

      {membersQuery.isError && <ErrorState message={(membersQuery.error as Error).message} />}

      {membersQuery.data && (
        <div className="space-y-4">
          {activeMembers.map((member) => {
            const isLastActiveAdmin =
              member.program_role === "admin" && member.status === "active" && activeAdminCount <= 1;
            return (
              <GlassCard key={member.member_id} padding="md">
                <div className="flex items-center gap-4">
                  <div className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-rf-text">
                    {initials(member.member_name)}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-rf-text">{member.member_name}</p>
                    <p className="text-xs text-rf-text-muted">
                      {roleLabel(member.program_role)}
                      {member.global_role === "global_admin" ? " • Global Admin" : ""}
                    </p>
                  </div>
                  {updatingId === member.member_id && (
                    <span className="ml-auto text-xs text-rf-text-muted">Updating...</span>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <RoleButton
                    label="Admin"
                    active={member.program_role === "admin"}
                    disabled={isLastActiveAdmin}
                    pending={updateMutation.isPending}
                    onClick={() => handleRoleChange(member, "admin")}
                    tone="admin"
                  />
                  <RoleButton
                    label="Logger"
                    active={member.program_role === "logger"}
                    disabled={isLastActiveAdmin}
                    pending={updateMutation.isPending}
                    onClick={() => handleRoleChange(member, "logger")}
                    tone="logger"
                  />
                  <RoleButton
                    label="Member"
                    active={member.program_role === "member"}
                    disabled={isLastActiveAdmin}
                    pending={updateMutation.isPending}
                    onClick={() => handleRoleChange(member, "member")}
                    tone="member"
                  />
                </div>

                {isLastActiveAdmin && (
                  <p className="mt-3 text-xs text-rf-text-muted">
                    You cannot remove the last active admin from the program.
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

type RoleTone = "admin" | "logger" | "member";

// D-C1 — tokenized role colors (theme-aware): admin → rf-warning, logger → rf-info, member →
// rf-text-muted (replacing the legacy fixed light-mode hexes #f59e0b / #3b82f6 / #6b7280). Admin keeps
// dark ink on amber; logger/member keep white. Light-mode --rf-warning is literally #f59e0b.
const ROLE_TONES: Record<RoleTone, { activeClass: string; borderClass: string }> = {
  admin: { activeClass: "bg-rf-warning text-[#111827] border-rf-warning", borderClass: "border-rf-warning" },
  logger: { activeClass: "bg-rf-info text-white border-rf-info", borderClass: "border-rf-info" },
  member: { activeClass: "bg-rf-text-muted text-white border-rf-text-muted", borderClass: "border-rf-text-muted" }
};

function RoleButton({
  label,
  active,
  disabled,
  pending,
  onClick,
  tone
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
  tone: RoleTone;
}) {
  const toneConfig = ROLE_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active || disabled || pending}
      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
        active ? toneConfig.activeClass : `bg-rf-surface-muted text-rf-text-muted ${toneConfig.borderClass}`
      } ${disabled && !active ? "opacity-50" : ""}`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

function roleLabel(role?: string | null) {
  switch (role) {
    case "admin":
      return "Program Admin";
    case "logger":
      return "Logger";
    default:
      return "Member";
  }
}
