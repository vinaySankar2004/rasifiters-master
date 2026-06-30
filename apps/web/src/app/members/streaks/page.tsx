"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { fetchMemberStreaks } from "@/lib/api/members";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export default function MemberStreaksPage() {
  const router = useRouter();
  const params = useClientSearchParams();
  const memberId = params.get("memberId") ?? "";
  const memberName = params.get("name") ?? "Member";
  const { session, program, token, programId } = useAuthGuard();
  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const canViewAny = isGlobalAdmin || program?.my_role === "admin" || program?.my_role === "logger";
  const loggedInUserId = session?.user.id;

  useEffect(() => {
    if (!memberId) return;
    if (!canViewAny && memberId !== loggedInUserId) {
      router.push("/members");
    }
  }, [memberId, canViewAny, loggedInUserId, router]);

  const streaksQuery = useQuery({
    queryKey: ["members", "streaks", programId, memberId],
    queryFn: () => fetchMemberStreaks(token, programId, memberId),
    enabled: !!token && !!programId && !!memberId
  });

  return (
    <PageShell maxWidth="3xl">
      <PageHeader title="Streak Stats" subtitle={memberName} backHref="/members" />

      {streaksQuery.isLoading && <LoadingState message="Loading streaks..." />}

      {streaksQuery.isError && <ErrorState message={(streaksQuery.error as Error).message} />}

      {streaksQuery.data && (
        <GlassCard padding="lg">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="metric-pill rounded-2xl px-4 py-4">
              <p className="text-xs text-rf-text-muted">Current</p>
              <p className="text-xl font-semibold text-rf-text">
                {streaksQuery.data.currentStreakDays} days
              </p>
            </div>
            <div className="metric-pill rounded-2xl px-4 py-4">
              <p className="text-xs text-rf-text-muted">Longest</p>
              <p className="text-xl font-semibold text-rf-text">
                {streaksQuery.data.longestStreakDays} days
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-rf-text">Milestones</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {streaksQuery.data.milestones.map((milestone) => (
                <span
                  key={milestone.dayValue}
                  className={`metric-pill rounded-full px-3 py-1 text-xs font-semibold ${
                    milestone.achieved
                      ? "text-rf-accent ring-1 ring-rf-accent/40"
                      : "text-rf-text-muted"
                  }`}
                >
                  {milestone.achieved && <span aria-hidden="true">✓ </span>}
                  {milestone.dayValue}d
                </span>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
    </PageShell>
  );
}
