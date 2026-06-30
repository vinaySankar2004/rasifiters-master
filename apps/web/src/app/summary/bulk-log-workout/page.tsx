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
import { BulkLogWorkoutForm } from "@/components/forms/BulkLogWorkoutForm";

export default function BulkLogWorkoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();

  const canLogForAny =
    session?.user.globalRole === "global_admin" ||
    program?.my_role === "admin" ||
    program?.my_role === "logger";
  const dataEntryLocked = isDataEntryLocked(session, program);

  useEffect(() => {
    if (!program?.id) return;
    if (dataEntryLocked) {
      router.replace("/summary");
    } else if (!canLogForAny) {
      router.replace("/summary/log-workout");
    }
  }, [program?.id, canLogForAny, dataEntryLocked, router]);

  const bulkWorkoutMutation = useMutation({
    mutationFn: (entries: BulkWorkoutEntry[]) =>
      addWorkoutLogsBatch(token, { program_id: programId, entries }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/summary");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Bulk log workouts"
        subtitle="Add multiple sessions at once."
        backHref="/summary"
      />
      <div className="mt-6">
        <BulkLogWorkoutForm
          variant="page"
          programId={programId}
          token={token}
          onClose={() => router.push("/summary")}
          onSubmit={(entries) => bulkWorkoutMutation.mutate(entries)}
          isSaving={bulkWorkoutMutation.isPending}
          errorMessage={bulkWorkoutMutation.isError ? (bulkWorkoutMutation.error as Error).message : null}
          rowErrors={
            bulkWorkoutMutation.error instanceof ApiError
              ? (bulkWorkoutMutation.error.details as BulkRowError[] | undefined) ?? null
              : null
          }
        />
      </div>
    </PageShell>
  );
}
