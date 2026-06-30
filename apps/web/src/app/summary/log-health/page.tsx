"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDailyHealthLog } from "@/lib/api/logs";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogDailyHealthForm } from "@/components/forms/LogDailyHealthForm";

export default function LogHealthPage() {
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

  const dailyHealthMutation = useMutation({
    mutationFn: (payload: {
      member_id?: string;
      log_date: string;
      sleep_hours?: number | null;
      food_quality?: number | null;
    }) => addDailyHealthLog(token, { program_id: programId, ...payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/summary");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Log daily health"
        subtitle="Track sleep hours and diet quality for the day."
        backHref="/summary"
      />
      <div className="mt-6">
        <LogDailyHealthForm
          variant="page"
          canSelectAnyMember={canLogForAny}
          programId={programId}
          token={token}
          userId={session?.user.id}
          onClose={() => router.push("/summary")}
          onSubmit={(payload) => dailyHealthMutation.mutate(payload)}
          isSaving={dailyHealthMutation.isPending}
          errorMessage={dailyHealthMutation.isError ? (dailyHealthMutation.error as Error).message : null}
        />
      </div>
    </PageShell>
  );
}
