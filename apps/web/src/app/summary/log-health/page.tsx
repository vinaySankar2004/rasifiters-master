"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDailyHealthLogsBatch, BulkHealthEntry, BulkRowError } from "@/lib/api/logs";
import { ApiError } from "@/lib/api/client";
import { toAppError } from "@/lib/kit/app-error";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { isDataEntryLocked } from "@/lib/permissions";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogDailyHealthForm } from "@/components/forms/LogDailyHealthForm";

export default function LogHealthPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, program, token, programId, isBootstrapping } = useAuthGuard();

  const isGlobalAdmin = session?.user.globalRole === "global_admin";
  const canLogForAny =
    isGlobalAdmin ||
    program?.my_role === "admin" ||
    program?.my_role === "logger";
  const dataEntryLocked = isDataEntryLocked(session, program);

  useEffect(() => {
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
    if (program?.id && dataEntryLocked) {
      router.replace("/summary");
    }
  }, [isBootstrapping, session, program?.id, dataEntryLocked, router]);

  const dailyHealthMutation = useMutation({
    mutationFn: ({ entries, programIds }: { entries: BulkHealthEntry[]; programIds: string[] }) =>
      addDailyHealthLogsBatch(token, { program_id: programId, program_ids: programIds, entries }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      router.push("/summary");
    }
  });

  return (
    <PageShell>
      <PageHeader
        title="Log daily health"
        subtitle="Track sleep, diet quality, and steps — add a row per day, then save them all at once."
        backHref="/summary"
      />
      <div className="mt-6">
        <LogDailyHealthForm
          variant="page"
          canSelectAnyMember={canLogForAny}
          programId={programId}
          token={token}
          userId={session?.user.id}
          isGlobalAdmin={isGlobalAdmin}
          onClose={() => router.push("/summary")}
          onSubmit={(entries, programIds) => dailyHealthMutation.mutate({ entries, programIds })}
          isSaving={dailyHealthMutation.isPending}
          errorMessage={dailyHealthMutation.isError ? toAppError(dailyHealthMutation.error).message : null}
          rowErrors={
            dailyHealthMutation.error instanceof ApiError
              ? (dailyHealthMutation.error.details as BulkRowError[] | undefined) ?? null
              : null
          }
        />
      </div>
    </PageShell>
  );
}
