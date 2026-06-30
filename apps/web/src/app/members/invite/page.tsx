"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { sendProgramInvite } from "@/lib/api/members";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InviteMemberPage() {
  const router = useRouter();
  const { session, program, token, programId } = useAuthGuard();
  const isProgramAdmin = program?.my_role === "admin" || session?.user.globalRole === "global_admin";

  const [username, setUsername] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isProgramAdmin) {
      router.push("/members");
    }
  }, [isProgramAdmin, router]);

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
      const message = error instanceof Error ? error.message : "Unable to send invite.";
      if (message.toLowerCase().includes("network")) {
        setErrorMessage("Network error. Please try again.");
      } else {
        setShowSuccess(true);
        setUsername("");
      }
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
            Invitation sent.
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
