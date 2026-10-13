"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { sendProgramInvite } from "@/lib/api/members";
import { toAppError } from "@/lib/kit/app-error";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InviteMemberPage() {
  const router = useRouter();
  const { session, program, token, programId, isBootstrapping } = useAuthGuard();
  const isProgramAdmin = program?.my_role === "admin" || session?.user.globalRole === "global_admin";

  const [username, setUsername] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
    if (!isProgramAdmin) {
      router.push("/members");
    }
  }, [isBootstrapping, session, isProgramAdmin, router]);

  const canSubmit = username.trim().length > 0 && !!programId;

  const handleSend = async () => {
    if (!canSubmit || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    setShowSuccess(false);
    try {
      await sendProgramInvite(token, programId, username.trim());
      setShowSuccess(true);
      setUsername("");
    } catch (error) {
      // invites SPEC §3.1: "Invitation sent" only on 2xx; every other outcome goes through the kit (400 = server text).
      setErrorMessage(toAppError(error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="Invite Member"
        subtitle="Enter the exact username to send a program invitation."
        backHref="/members"
      />

      <div className="modal-surface rounded-3xl p-6">
        <label className="text-sm font-semibold text-rf-text">Username</label>
        <div className="field-shell mt-2 flex items-center gap-2 rounded-2xl px-4 py-3">
          <span className="text-sm text-rf-text-muted">@</span>
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setShowSuccess(false);
              setErrorMessage(null);
            }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full bg-transparent text-sm font-semibold text-rf-text placeholder:text-rf-text-muted focus:outline-none"
          />
        </div>

        <div className="info-banner mt-4 rounded-2xl px-4 py-3 text-xs">
          The user must already have an account. Invitations are privacy-safe, so we won't confirm
          whether a username exists.
        </div>

        {errorMessage && <p className="mt-4 text-sm font-semibold text-rf-danger">{errorMessage}</p>}

        {showSuccess && (
          <div className="mt-4 rounded-2xl bg-rf-success/10 px-4 py-3 text-sm font-semibold text-rf-success">
            Invitation sent
          </div>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSubmit || isSending}
          className="mt-6 w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {isSending ? "Sending..." : "Send Invitation"}
        </button>
      </div>
    </PageShell>
  );
}
