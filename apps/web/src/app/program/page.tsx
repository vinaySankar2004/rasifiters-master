"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { clearActiveProgram } from "@/lib/storage";
import { getStoredTheme } from "@/lib/theme";
import { fetchMembershipDetails, leaveProgram, type MembershipDetail } from "@/lib/api/programs";
import { fetchProgramWorkouts } from "@/lib/api/program-workouts";
import { formatDateRange, initials } from "@/lib/format";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { useActiveProgramRow } from "@/lib/hooks/use-active-program-row";
import { programProgress, rowForDates } from "@/lib/program-days";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { NOTIFICATION_COPY } from "@/lib/api/notifications";
import { useUnreadCount } from "@/lib/notifications/queries";
import { INBOX_HREF } from "@/lib/notifications/targets";
import { PEOPLE_COPY, PEOPLE_LIVE } from "@/lib/api/people";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge, programStatusVariant } from "@/components/ui/StatusBadge";
import { PRIVACY_POLICY_URL } from "@/lib/config";
import {
  IconInfo,
  IconUsers,
  IconKey,
  IconDumbbell,
  IconUser,
  IconMail,
  IconSettings,
  IconLock,
  IconPalette,
  IconDocument,
  IconHelp,
  IconLogout
} from "@/components/icons";

export default function ProgramPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();
  const { signOut } = useAuth();
  const inboxBadge = useUnreadCount(token).data?.badge ?? 0; // the Inbox row's count, as on /programs

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || isGlobalAdmin;
  const canInvite = isProgramAdmin;
  const canManageRoles = isProgramAdmin;
  const canLeaveProgram = !isGlobalAdmin;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const membershipKey = ["program", "membership-details", programId];
  const workoutsKey = ["program", "workouts", programId];
  const membershipQuery = useQuery({
    queryKey: membershipKey,
    queryFn: () => fetchMembershipDetails(token, programId),
    enabled: !!token && !!programId
  });

  const workoutsQuery = useQuery({
    queryKey: workoutsKey,
    queryFn: () => fetchProgramWorkouts(token, programId),
    enabled: !!token && !!programId
  });

  // polish #33 (the Summary recipe): spinner → ErrorView + Retry → honest lines; never "0 active" for a failed read.
  // The workout types only count on the admin view (the member view never shows them).
  const online = useOnlineStatus();
  const membershipState = fromQuery(membershipQuery);
  const workoutsState = fromQuery(workoutsQuery);
  const membersPending = membershipState.status === "loading" || membershipState.status === "idle";
  const membersFailed = membershipState.status === "failed";
  const workoutsPending = workoutsState.status === "loading" || workoutsState.status === "idle";
  const workoutsFailed = workoutsState.status === "failed";
  const loadError =
    membershipState.status === "failed"
      ? membershipState.error
      : isProgramAdmin && workoutsState.status === "failed"
        ? workoutsState.error
        : null;
  const loadStale =
    !loadError && (membershipState.status === "stale" || (isProgramAdmin && workoutsState.status === "stale"));
  const retryLoads = () => {
    if (membershipQuery.isError || membershipQuery.failureCount > 0) void retryNow(queryClient, membershipKey);
    if (workoutsQuery.isError || workoutsQuery.failureCount > 0) void retryNow(queryClient, workoutsKey);
  };
  useRefetchOnReconnect([membershipQuery, workoutsQuery]);

  const leaveMutation = useMutation({
    mutationFn: () => leaveProgram(token, programId),
    onSuccess: async () => {
      clearActiveProgram();
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
      router.push("/programs");
    }
  });

  const userInitials = useMemo(() => {
    const name = session?.user.memberName ?? session?.user.username ?? "U";
    return initials(name);
  }, [session?.user.memberName, session?.user.username]);

  const membershipDetails = (membershipQuery.data ?? []).filter((member) => member.is_active);
  const activeMembers = membershipDetails.length;

  const admins = membershipDetails.filter((member) => member.program_role === "admin");
  const loggers = membershipDetails.filter((member) => member.program_role === "logger");

  const workoutData = workoutsQuery.data ?? [];
  const visibleWorkouts = workoutData.filter((workout) => !workout.is_hidden);
  const customWorkouts = workoutData.filter((workout) => workout.source === "custom");

  // D1 (programs SPEC §9 D-C6; supersedes D-C3 / F4): the progress row reads the open program's /programs row — the
  // Summary ring's and the picker bar's numbers; the snapshot dates feed the same-rule fallback until it loads.
  const programRow = useActiveProgramRow(token, session?.user.id, programId);
  const progress = programProgress(rowForDates(programRow, program) ?? program);

  const errorMessage = leaveMutation.isError ? toAppError(leaveMutation.error).message : null;

  return (
    <>
      <PageShell>
        <header className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-rf-text">Program</h1>
            <p className="mt-1 text-sm font-semibold text-rf-text-muted">{program?.name ?? "Program"}</p>
          </div>
          {/* Touch-up (c), D-PC1: the initials circle opens My Profile; its Back (router.back) returns here. */}
          <button
            type="button"
            onClick={() => router.push("/program/profile")}
            aria-label="My Profile"
            className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-base font-bold text-black"
          >
            {userInitials || "RF"}
          </button>
        </header>

        {errorMessage && <ErrorState message={errorMessage} />}
        {loadError && <ErrorView error={online ? loadError : appError("offline")} onRetry={retryLoads} />}

        {isProgramAdmin ? (
          <div className="space-y-5">
            <SectionCard title="Program Info" icon={<IconInfo className="h-4 w-4" />}>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => router.push("/programs")}
                  className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    ⇄
                  </span>
                  <div>
                    <p>Select Program</p>
                    <p className="text-xs text-rf-text-muted">Switch to a different program</p>
                  </div>
                  <span className="ml-auto text-rf-text-muted">›</span>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/program/edit")}
                  className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    ✎
                  </span>
                  <div>
                    <p>Edit Program Details</p>
                    <p className="text-xs text-rf-text-muted">
                      {(program?.status ?? "active").toUpperCase()} • {formatDateRange(program?.start_date, program?.end_date)}
                    </p>
                  </div>
                  <span className="ml-auto text-rf-text-muted">›</span>
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Members" icon={<IconUsers className="h-4 w-4" />}>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => router.push("/members/list")}
                  className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <IconUser className="h-5 w-5" />
                    </span>
                  <div>
                    <p>{PEOPLE_LIVE ? PEOPLE_COPY.title : "View Members"}</p>
                    <p className="text-xs text-rf-text-muted">
                      {membersPending
                        ? "Loading..."
                        : membersFailed
                          ? "—"
                          : PEOPLE_LIVE
                          ? PEOPLE_COPY.enrolled(activeMembers)
                          : `${activeMembers} active`}
                    </p>
                  </div>
                  <span className="ml-auto text-rf-text-muted">›</span>
                </button>

                {canInvite && (
                  <button
                    type="button"
                    onClick={() => router.push("/members/invite")}
                    className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <IconMail className="h-5 w-5" />
                    </span>
                    <div>
                      <p>Invite Member</p>
                      <p className="text-xs text-rf-text-muted">Send program invitation</p>
                    </div>
                    <span className="ml-auto text-rf-text-muted">›</span>
                  </button>
                )}
              </div>
            </SectionCard>

            {canManageRoles && (
              <SectionCard title="Role Management" icon={<IconKey className="h-4 w-4" />}>
                <div className="space-y-4">
                  {membersPending && (
                    <div className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
                      Loading roles...
                    </div>
                  )}

                  {!membersPending && !membersFailed && admins.length === 0 && loggers.length === 0 && (
                    <div className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
                      No admins or loggers assigned.
                    </div>
                  )}

                  {admins.length > 0 && (
                    <RoleList title="Admins" members={admins} accent="text-amber-600" />
                  )}

                  {loggers.length > 0 && (
                    <RoleList title="Loggers" members={loggers} accent="text-blue-600" />
                  )}

                  <button
                    type="button"
                    onClick={() => router.push("/program/roles")}
                    className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                      <IconSettings className="h-5 w-5" />
                    </span>
                    <div>
                      <p>Manage Roles</p>
                      <p className="text-xs text-rf-text-muted">Set admin, logger, or member roles</p>
                    </div>
                    <span className="ml-auto text-rf-text-muted">›</span>
                  </button>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Workout Types" icon={<IconDumbbell className="h-4 w-4" />}>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => router.push("/lifestyle/workouts")}
                  className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                    ☰
                  </span>
                  <div>
                    <p>Workout Types</p>
                    <p className="text-xs text-rf-text-muted">
                      {workoutsPending
                        ? "Loading..."
                        : workoutsFailed
                          ? "—"
                          : customWorkouts.length > 0
                          ? `${visibleWorkouts.length} available, ${customWorkouts.length} custom`
                          : `${visibleWorkouts.length} types available`}
                    </p>
                  </div>
                  <span className="ml-auto text-rf-text-muted">›</span>
                </button>
              </div>
            </SectionCard>

            {canLeaveProgram && <LeaveProgramButton onClick={() => setShowLeaveConfirm(true)} />}

            <MyAccountSection
              name={session?.user.memberName ?? ""}
              username={session?.user.username ?? ""}
              onSignOut={() => setShowSignOut(true)}
              isGlobalAdmin={isGlobalAdmin}
              inboxBadge={inboxBadge}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <GlassCard padding="lg">
              <div className="flex items-center gap-2 text-sm font-semibold text-rf-text">
                <span className="text-blue-600">
                  <IconInfo className="h-4 w-4" />
                </span>
                Program Info
              </div>

              <div className="mt-4 space-y-4 rounded-2xl border border-rf-border bg-rf-surface-muted p-4 text-sm">
                <InfoRow label="Name" value={program?.name ?? "Program"} />
                <Divider />
                <InfoRow
                  label="Status"
                  value={
                    <StatusBadge variant={programStatusVariant(program?.status ?? "active")}>
                      {(program?.status ?? "active").toLowerCase()}
                    </StatusBadge>
                  }
                  alignEnd
                />
                <Divider />
                <InfoRow
                  label="Duration"
                  value={formatDateRange(program?.start_date ?? null, program?.end_date ?? null)}
                  alignEnd
                />
                <Divider />
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-rf-text-muted">
                    <span>Progress</span>
                    <span className="text-rf-text">{progress.percent}%</span>
                  </div>
                  <div className="progress-track mt-2 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-rf-accent"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-rf-text-muted">
                    <span>{progress.elapsedDays} days elapsed</span>
                    <span>{progress.remainingDays} days remaining</span>
                  </div>
                </div>
                <Divider />
                <InfoRow
                  label="Members"
                  // R9 / D3: the /programs row's active_members, as iOS + Android; the roster count until the row loads.
                  value={
                    programRow?.active_members !== undefined
                      ? `${programRow.active_members}`
                      : membersPending || membersFailed
                        ? "—"
                        : `${activeMembers}`
                  }
                  alignEnd
                />
              </div>
            </GlassCard>

            <button
              type="button"
              onClick={() => router.push("/programs")}
              className="flex w-full items-center gap-4 rounded-3xl border border-rf-border bg-rf-surface-muted px-5 py-4 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                ⇄
              </span>
              <div>
                <p>Switch Program</p>
                <p className="text-xs text-rf-text-muted">View a different program</p>
              </div>
              <span className="ml-auto text-rf-text-muted">›</span>
            </button>

            {canLeaveProgram && <LeaveProgramButton onClick={() => setShowLeaveConfirm(true)} />}

            <MyAccountSection
              name={session?.user.memberName ?? ""}
              username={session?.user.username ?? ""}
              onSignOut={() => setShowSignOut(true)}
              isGlobalAdmin={isGlobalAdmin}
              inboxBadge={inboxBadge}
            />
          </div>
        )}
      </PageShell>

      <ConfirmDialog
        open={showLeaveConfirm}
        title="Leave Program?"
        description={`You will no longer have access to ${program?.name ?? "this program"}. Your data will be preserved and restored if you rejoin. If you're the last member, the program will be deleted automatically.`}
        confirmLabel={leaveMutation.isPending ? "Leaving..." : "Leave"}
        danger
        onConfirm={() => leaveMutation.mutate()}
        onClose={() => setShowLeaveConfirm(false)}
      />

      {/* polish #41: the Program tab's Sign Out confirms first (the picker keeps its own "Sign Out" title). */}
      <ConfirmDialog
        open={showSignOut}
        title="Sign Out?"
        description="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        danger
        onClose={() => setShowSignOut(false)}
        onConfirm={async () => {
          await signOut();
          router.push("/login");
        }}
      />

      {loadStale && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryLoads} />
        </>
      )}
    </>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <GlassCard padding="lg">
      <div className="flex items-center gap-2 text-sm font-semibold text-rf-text">
        <span className="text-rf-text">{icon}</span>
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </GlassCard>
  );
}

function LeaveProgramButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-3xl border border-rf-border bg-rf-surface-muted px-5 py-4 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-600">
        ↩︎
      </span>
      <div>
        <p>Leave Program</p>
        <p className="text-xs text-rf-text-muted">Your data will be preserved</p>
      </div>
      <span className="ml-auto text-rf-text-muted">›</span>
    </button>
  );
}

function RoleList({
  title,
  members,
  accent
}: {
  title: string;
  members: MembershipDetail[];
  accent: string;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</p>
      <div className="mt-2 grid gap-2">
        {members.map((member) => (
          <div
            key={member.member_id}
            className="flex items-center gap-3 rounded-2xl bg-rf-surface-muted px-3 py-2 text-sm"
          >
            <div className="metric-pill flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-rf-text">
              {initials(member.member_name)}
            </div>
            <div>
              <p className="font-semibold text-rf-text">{member.member_name}</p>
              {member.global_role === "global_admin" && (
                <p className="text-xs text-rf-text-muted">Global Admin</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  alignEnd
}: {
  label: string;
  value: React.ReactNode;
  alignEnd?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-semibold text-rf-text-muted">{label}</span>
      <span className={`text-sm font-semibold text-rf-text ${alignEnd ? "text-right" : ""}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="subtle-divider" />;
}

function MyAccountSection({
  name,
  username,
  onSignOut,
  isGlobalAdmin,
  inboxBadge
}: {
  name: string;
  username: string;
  onSignOut: () => void;
  isGlobalAdmin: boolean;
  inboxBadge: number;
}) {
  const router = useRouter();
  const [appearance, setAppearance] = useState("System");

  useEffect(() => {
    const preference = getStoredTheme();
    setAppearance(preference === "dark" ? "Dark" : preference === "light" ? "Light" : "System");
  }, []);
  return (
    <SectionCard title="My Account" icon={<IconUser className="h-4 w-4" />}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => router.push("/program/profile")}
          className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
        >
          {/* polish #41: the profile row names the member (iOS ProfileRow parity). */}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-600">
            {initials(name || username) || <IconUser className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate">{name || "My Profile"}</p>
            <p className="truncate text-xs text-rf-text-muted">{username ? `@${username}` : "Update your personal info"}</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>

        <AccountLinkRow
          title={NOTIFICATION_COPY.inbox}
          subtitle={NOTIFICATION_COPY.inboxRowSubtitle(inboxBadge)}
          icon={<IconMail className="h-5 w-5" />}
          iconClass="bg-blue-100 text-blue-600"
          count={inboxBadge}
          onClick={() => router.push(INBOX_HREF)}
        />
        <AccountLinkRow
          title={NOTIFICATION_COPY.settingsRow}
          subtitle={NOTIFICATION_COPY.settingsRowSubtitle}
          icon={<IconSettings className="h-5 w-5" />}
          iconClass="bg-emerald-100 text-emerald-600"
          onClick={() => router.push("/program/notifications")}
        />

        <button
          type="button"
          onClick={() => router.push("/program/password")}
          className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <IconLock className="h-5 w-5" />
          </span>
          <div>
            <p>Change Password</p>
            <p className="text-xs text-rf-text-muted">Update your account password</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/program/appearance")}
          className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
            <IconPalette className="h-5 w-5" />
          </span>
          <div>
            <p>Appearance</p>
            <p className="text-xs text-rf-text-muted">{appearance}</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>

        {isGlobalAdmin && (
          <AccountLinkRow
            title={NOTIFICATION_COPY.announcementsRow}
            subtitle={NOTIFICATION_COPY.announcementsRowSubtitle}
            icon={<IconUsers className="h-5 w-5" />}
            iconClass="bg-amber-100 text-amber-600"
            onClick={() => router.push("/program/announcements")}
          />
        )}

        <button
          type="button"
          onClick={() => window.open(PRIVACY_POLICY_URL, "_blank", "noopener")}
          className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <IconDocument className="h-5 w-5" />
          </span>
          <div>
            <p>Privacy Policy</p>
            <p className="text-xs text-rf-text-muted">Learn how we handle your data</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>

        {/* polish #41: /privacy-policy and /support are public pages with no in-app back; open them beside the app, as
            the phones do (one policy copy — privacy-policy D-ONE). */}
        <AccountLinkRow
          title="Support"
          subtitle="Get help or contact us"
          icon={<IconHelp className="h-5 w-5" />}
          iconClass="bg-amber-100 text-amber-600"
          onClick={() => window.open("/support", "_blank", "noopener")}
        />

        <button
          type="button"
          onClick={onSignOut}
          className="danger-row flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-sm"
        >
          <span className="danger-icon flex h-10 w-10 items-center justify-center rounded-full">
            <IconLogout className="h-5 w-5" />
          </span>
          Sign Out
        </button>
      </div>
    </SectionCard>
  );
}

function AccountLinkRow({
  title,
  subtitle,
  icon,
  iconClass,
  count,
  onClick
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconClass: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}>{icon}</span>
      <div>
        <p>{title}</p>
        <p className="text-xs text-rf-text-muted">{subtitle}</p>
      </div>
      {count ? (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1.5 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <span className={`${count ? "" : "ml-auto "}text-rf-text-muted`}>›</span>
    </button>
  );
}
