"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { ANNOUNCEMENT_COPY } from "@/lib/api/announcements";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ComposerForm } from "@/components/announcements/ComposerForm";
import { AnnouncementHistory } from "@/components/announcements/AnnouncementHistory";

// D-N16: the send-anytime composer — global admins only (everyone else is sent to /programs; the server answers 403 too).
// Entry points: the account menus' Announcements row (global admins only).
export default function AnnouncementsPage() {
  const router = useRouter();
  const { session, program, token } = useAuthGuard({ requireProgram: false });
  const isGlobalAdmin = session?.user.globalRole === "global_admin";

  useEffect(() => {
    if (session && !isGlobalAdmin) router.replace("/programs");
  }, [session, isGlobalAdmin, router]);

  if (!session || !isGlobalAdmin) return null;

  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title={ANNOUNCEMENT_COPY.title}
        subtitle={ANNOUNCEMENT_COPY.subtitle}
        backHref={program?.id ? "/program" : "/programs"}
      />
      <ComposerForm
        token={token}
        self={{ id: session.user.id ?? "", name: session.user.memberName ?? ANNOUNCEMENT_COPY.you }}
      />
      <AnnouncementHistory token={token} />
    </PageShell>
  );
}
