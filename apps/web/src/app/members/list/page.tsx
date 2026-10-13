"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMembershipDetails, type MembershipDetail } from "@/lib/api/programs";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { fetchPeople, lastActiveLine, PEOPLE_COPY, PEOPLE_LIVE, peopleKeys, roleMarker, type PersonRow } from "@/lib/api/people";
import { initials } from "@/lib/format";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { IconMail } from "@/components/icons";
import { ActivityVisibilityNotice } from "@/components/people/ActivityVisibilityNotice";

// /members/list — the People go-live rule. PEOPLE_LIVE false → today's roster, unchanged (RosterList:
// GET /program-memberships/details, ★ for admins, rows open only for global admins, Inactive badge). true → People
// (PeopleList: GET /api/people). RosterList + MemberRow are deleted in the post-release cleanup.
export default function MembersListPage() {
  return PEOPLE_LIVE ? <PeopleList /> : <RosterList />;
}

function RosterList() {
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

      {membersQuery.isError && <ErrorState message={toAppError(membersQuery.error).message} />}

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

// People: the current program's active members, the caller first ("You"), server initials and a status line; every row
// opens that person's profile, and a hidden member shows by name with "Activity hidden". Program admins and global
// admins get the "Invite member" row on top (where the admin Invite pill moved). Kit states throughout, and the
// one-time "Who can see your activity" notice on the first open (the activity-notice rule).
function PeopleList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();
  const isProgramAdmin = program?.my_role === "admin" || session?.user.globalRole === "global_admin";
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const listKey = peopleKeys.list(programId);
  const peopleQuery = useQuery({
    queryKey: listKey,
    queryFn: () => fetchPeople(token, programId),
    enabled: !!token && !!programId
  });
  useRefetchOnReconnect([peopleQuery]);
  const state = fromQuery(peopleQuery);

  const filtered = useMemo(() => {
    const people = peopleQuery.data?.people ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return people;
    return people.filter(
      (person) => person.member_name.toLowerCase().includes(query) || person.username.toLowerCase().includes(query)
    );
  }, [peopleQuery.data, search]);

  return (
    <PageShell maxWidth="4xl">
      <PageHeader title={PEOPLE_COPY.title} subtitle={program?.name ?? "Program"} backHref="/members" />
      {isProgramAdmin && (
        <button type="button" onClick={() => router.push("/members/invite")} className="w-full text-left">
          <GlassCard padding="sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rf-accent">
                <IconMail className="h-6 w-6 text-black" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-rf-text">{PEOPLE_COPY.inviteRow}</p>
                <p className="truncate text-xs text-rf-text-muted">{PEOPLE_COPY.inviteRowSubtitle}</p>
              </div>
              <span aria-hidden="true" className="shrink-0 text-rf-text-muted">›</span>
            </div>
          </GlassCard>
        </button>
      )}
      <GlassCard>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={PEOPLE_COPY.searchPlaceholder}
          aria-label={PEOPLE_COPY.searchPlaceholder}
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
        />
      </GlassCard>
      {state.status === "loading" && <LoadingState message={PEOPLE_COPY.loading} />}
      {state.status === "failed" && (
        <ErrorView error={online ? state.error : appError("offline")} onRetry={() => void retryNow(queryClient, listKey)} />
      )}
      {peopleQuery.data && filtered.length === 0 && (
        <EmptyState message={search.trim() ? PEOPLE_COPY.noMatch : PEOPLE_COPY.empty} />
      )}
      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((person) => (
            <PersonRowCard
              key={person.member_id}
              person={person}
              onOpen={() => router.push(`/members/person?memberId=${person.member_id}`)}
            />
          ))}
        </div>
      )}
      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void peopleQuery.refetch()} />
        </>
      )}
      {session?.user.id && <ActivityVisibilityNotice token={token} memberId={session.user.id} />}
    </PageShell>
  );
}

function PersonRowCard({ person, onOpen }: { person: PersonRow; onOpen: () => void }) {
  const status = person.activity_visible ? lastActiveLine(person.last_active) : PEOPLE_COPY.hiddenRow;
  const marker = roleMarker(person.program_role);
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <GlassCard padding="sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rf-surface-muted text-sm font-semibold text-rf-text">
            {person.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-semibold text-rf-text">{person.member_name}</p>
              {person.is_you && (
                <span className="shrink-0 rounded-full bg-rf-accent/15 px-2 py-0.5 text-[11px] font-semibold text-rf-accent">
                  {PEOPLE_COPY.you}
                </span>
              )}
              {marker && <span className="shrink-0 text-xs font-semibold text-rf-text-muted">{marker}</span>}
            </div>
            <p className="truncate text-xs text-rf-text-muted">{status}</p>
          </div>
          <span aria-hidden="true" className="shrink-0 text-rf-text-muted">›</span>
        </div>
      </GlassCard>
    </button>
  );
}
