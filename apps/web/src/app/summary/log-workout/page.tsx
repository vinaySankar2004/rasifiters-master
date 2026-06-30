"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addWorkoutLog } from "@/lib/api/logs";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogWorkoutForm } from "@/components/forms/LogWorkoutForm";

export default function LogWorkoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId } = useAuthGuard();

  const canLogForAny =
    session?.user.globalRole === "global_admin" ||
    program?.my_role === "admin" ||
    program?.my_role === "logger";
  const dataEntryLocked = isDataEntryLocked(session, program);

  useEffect(() => {
    if (program?.id && dataEntryLocked) {
      router.replace("/summary");
    }
  }, [program?.id, dataEntryLocked, router]);

  const workoutLogMutation = useMutation({
    mutationFn: (payload: {
      member_id?: string;
      member_name?: string;
      workout_name: string;
      date: string;
      duration: number;
    }) => addWorkoutLog(token, { program_id: programId, ...payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/summary");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Log workout"
        subtitle="Pick member, workout, date, and duration."
        backHref="/summary"
      />
      <div className="mt-6">
        <LogWorkoutForm
          variant="page"
          canSelectAnyMember={canLogForAny}
          programId={programId}
          token={token}
          userId={session?.user.id}
          onClose={() => router.push("/summary")}
          onSubmit={(payload) => workoutLogMutation.mutate(payload)}
          isSaving={workoutLogMutation.isPending}
          errorMessage={workoutLogMutation.isError ? (workoutLogMutation.error as Error).message : null}
        />
      </div>
    </PageShell>
  );
}
