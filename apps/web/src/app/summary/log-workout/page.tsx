"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addWorkoutLogsBatch, BulkRowError, BulkWorkoutEntry } from "@/lib/api/logs";
import { ApiError } from "@/lib/api/client";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogWorkoutsForm } from "@/components/forms/LogWorkoutsForm";

export default function LogWorkoutsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const canLogForAny =
    isGlobalAdmin ||
    program?.my_role === "admin" ||
    program?.my_role === "logger";
  const dataEntryLocked = isDataEntryLocked(session, program);

  useEffect(() => {
    if (program?.id && dataEntryLocked) {
      router.replace("/summary");
    }
  }, [program?.id, dataEntryLocked, router]);

  const workoutsMutation = useMutation({
    mutationFn: ({ entries, programIds }: { entries: BulkWorkoutEntry[]; programIds: string[] }) =>
      addWorkoutLogsBatch(token, { program_id: programId, program_ids: programIds, entries }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/summary");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Add workouts"
        subtitle="Log one or many sessions at once."
        backHref="/summary"
      />
      <div className="mt-6">
        <LogWorkoutsForm
          variant="page"
          canSelectAnyMember={canLogForAny}
          selfMemberId={session?.user.id}
          isGlobalAdmin={isGlobalAdmin}
          programId={programId}
          token={token}
          onClose={() => router.push("/summary")}
          onSubmit={(entries, programIds) => workoutsMutation.mutate({ entries, programIds })}
          isSaving={workoutsMutation.isPending}
          errorMessage={workoutsMutation.isError ? (workoutsMutation.error as Error).message : null}
          rowErrors={
            workoutsMutation.error instanceof ApiError
              ? (workoutsMutation.error.details as BulkRowError[] | undefined) ?? null
              : null
          }
        />
      </div>
    </PageShell>
  );
}
