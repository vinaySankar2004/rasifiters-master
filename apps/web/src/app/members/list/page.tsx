"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMembershipDetails, type MembershipDetail } from "@/lib/api/programs";
import { initials } from "@/lib/format";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

export default function MembersListPage() {
  const router = useRouter();
  const { session, program, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const [search, setSearch] = useState("");

  const membersQuery = useQuery({
    queryKey: ["members", "details", programId],
    queryFn: () => fetchMembershipDetails(token, programId),
    enabled: !!token && !!programId
  });

  const activeMembers = useMemo(() => {
    return (membersQuery.data ?? []).filter((member) => member.status === "active");
  }, [membersQuery.data]);

  const filtered = useMemo(() => {
    if (!membersQuery.data) return [];
    if (!search.trim()) return activeMembers;
    const query = search.trim().toLowerCase();
    return activeMembers.filter((member) => member.member_name.toLowerCase().includes(query));
  }, [activeMembers, membersQuery.data, search]);

  return (
    <PageShell maxWidth="4xl">
      <PageHeader title="Members" subtitle={program?.name ?? "Program"} backHref="/members" />

      <GlassCard>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search members"
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
        />
      </GlassCard>

      {membersQuery.isLoading && <LoadingState message="Loading members..." />}

      {membersQuery.isError && <ErrorState message={(membersQuery.error as Error).message} />}

      {membersQuery.data && filtered.length === 0 && <EmptyState message="No members found." />}

      {membersQuery.data && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((member) => (
            <MemberRow
              key={member.member_id}
              member={member}
              canEdit={isGlobalAdmin}
              onClick={() => router.push(`/members/detail?memberId=${member.member_id}`)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function MemberRow({
  member,
  canEdit,
  onClick
}: {
  member: MembershipDetail;
  canEdit: boolean;
  onClick: () => void;
}) {
  const content = (
    <GlassCard padding="sm">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rf-surface-muted text-sm font-semibold">
          {initials(member.member_name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-rf-text">{member.member_name}</p>
            {member.program_role === "admin" && <span className="text-xs text-rf-accent">★</span>}
          </div>
          <p className="text-xs text-rf-text-muted">@{member.username ?? ""}</p>
        </div>
        <div className="ml-auto text-right">
          {!member.is_active && (
            <span className="rounded-full bg-rf-danger/10 px-3 py-1 text-xs font-semibold text-rf-danger">
              Inactive
            </span>
          )}
        </div>
      </div>
    </GlassCard>
  );

  if (!canEdit) return content;
  return (
    <button type="button" onClick={onClick} className="text-left">
      {content}
    </button>
  );
}
