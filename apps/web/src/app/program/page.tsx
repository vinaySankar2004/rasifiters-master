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
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge, programStatusVariant } from "@/components/ui/StatusBadge";
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
  IconLogout
} from "@/components/icons";

export default function ProgramPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();
  const { signOut } = useAuth();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const isProgramAdmin = program?.my_role === "admin" || isGlobalAdmin;
  const canInvite = isProgramAdmin;
  const canManageRoles = isProgramAdmin;
  const canLeaveProgram = !isGlobalAdmin;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const membershipQuery = useQuery({
    queryKey: ["program", "membership-details", programId],
    queryFn: () => fetchMembershipDetails(token, programId),
    enabled: !!token && !!programId
  });

  const workoutsQuery = useQuery({
    queryKey: ["program", "workouts", programId],
    queryFn: () => fetchProgramWorkouts(token, programId),
    enabled: !!token && !!programId
  });

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

  const progress = useMemo(() => {
    return computeProgramProgress(program?.start_date ?? null, program?.end_date ?? null);
  }, [program?.start_date, program?.end_date]);

  const errorMessage = leaveMutation.isError ? (leaveMutation.error as Error).message : null;

  return (
    <>
      <PageShell>
        <header className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-rf-text">Program</h1>
            <p className="mt-1 text-sm font-semibold text-rf-text-muted">{program?.name ?? "Program"}</p>
          </div>
          <div className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-rf-accent text-base font-bold text-black">
            {userInitials || "RF"}
          </div>
        </header>

        {errorMessage && <ErrorState message={errorMessage} />}

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
                    <p>View Members</p>
                    <p className="text-xs text-rf-text-muted">
                      {membershipQuery.isLoading ? "Loading..." : `${activeMembers} active`}
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
                  {membershipQuery.isLoading && (
                    <div className="rounded-2xl bg-rf-surface-muted px-4 py-3 text-sm text-rf-text-muted">
                      Loading roles...
                    </div>
                  )}

                  {!membershipQuery.isLoading && admins.length === 0 && loggers.length === 0 && (
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
                      {workoutsQuery.isLoading
                        ? "Loading..."
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

            <MyAccountSection onSignOut={signOut} />
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
                  label="Active Members"
                  value={membershipQuery.isLoading ? "—" : `${activeMembers}`}
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

            <MyAccountSection onSignOut={signOut} />
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

function computeProgramProgress(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) {
    return { totalDays: 0, elapsedDays: 0, remainingDays: 0, percent: 0 };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { totalDays: 0, elapsedDays: 0, remainingDays: 0, percent: 0 };
  }
  const msInDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(Math.round((end.getTime() - start.getTime()) / msInDay), 0);
  const today = new Date();
  const elapsedDays = Math.min(
    Math.max(Math.round((today.getTime() - start.getTime()) / msInDay), 0),
    totalDays
  );
  const remainingDays = Math.max(totalDays - elapsedDays, 0);
  const percent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;
  return { totalDays, elapsedDays, remainingDays, percent };
}

function MyAccountSection({ onSignOut }: { onSignOut: () => Promise<void> }) {
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <IconUser className="h-5 w-5" />
          </span>
          <div>
            <p>My Profile</p>
            <p className="text-xs text-rf-text-muted">Update your personal info</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>

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

        <button
          type="button"
          onClick={() => router.push("/program/privacy")}
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

        <button
          type="button"
          onClick={() => onSignOut()}
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
