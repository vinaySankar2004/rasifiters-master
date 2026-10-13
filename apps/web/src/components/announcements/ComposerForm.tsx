"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  BODY_MAX,
  MERGE_FIELDS,
  TITLE_MAX,
  announcementSendErrorMessage,
  audienceText,
  buildAnnouncementRequest,
  insertAt,
  localDate,
  sendAnnouncement,
  type AnnouncementRequest,
  type DeliveryMode,
  type MergeField,
  type TargetKind
} from "@/lib/api/announcements";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AudiencePicker } from "@/components/announcements/MemberPicker";
import {
  AnnouncementPreviewPanel,
  DeliveryPicker,
  useAnnouncementPreview
} from "@/components/announcements/ComposerSections";

const FIELD_CLASS = "input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium";

// D-N16 composer: who → title + message with merge fields → now or each person's local time → live preview → Send.
// W15: Send unlocks only when the preview is current (exactly what is on screen) and reaches someone, so the confirm's
// audience + count are the real ones. A failed send re-reads Recent announcements; a timeout / unknown failure may
// have gone out, so it says to check there before sending again. A 400 shows the server's own text; a 429 the
// composer's limit copy. The ConfirmDialog renders OUTSIDE the GlassCard: .glass-card's backdrop-filter would trap
// `position: fixed`.
export function ComposerForm({ token, self }: { token: string; self: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const [targetKind, setTargetKind] = useState<TargetKind>("program");
  const [programId, setProgramId] = useState("");
  const [programName, setProgramName] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("now");
  const [date, setDate] = useState(() => localDate(1));
  const [time, setTime] = useState("09:00");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"title" | "body">("body");

  const request = buildAnnouncementRequest({ targetKind, programId, memberIds, title, body, mode, date, time });
  const preview = useAnnouncementPreview(token, request);

  const send = useMutation({
    mutationFn: (payload: AnnouncementRequest) => sendAnnouncement(token, payload),
    onMutate: () => setSentMessage(null),
    onSuccess: (summary) => {
      setSentMessage(
        summary.mode === "now"
          ? ANNOUNCEMENT_COPY.sent(summary.recipient_count)
          : ANNOUNCEMENT_COPY.scheduled(summary.send_date ?? date, summary.send_time ?? time, summary.recipient_count)
      );
      setTitle("");
      setBody("");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.list })
  });
  const canSend = preview.current && preview.recipientCount > 0 && !send.isPending;

  // Inserts {field} at the cursor of the last focused field (the chips keep focus via preventDefault on mousedown).
  const insertField = (field: MergeField) => {
    const inTitle = lastField.current === "title";
    const element = inTitle ? titleRef.current : bodyRef.current;
    const value = inTitle ? title : body;
    const { text, caret } = insertAt(
      value,
      element?.selectionStart ?? value.length,
      element?.selectionEnd ?? value.length,
      `{${field}}`,
      inTitle ? TITLE_MAX : BODY_MAX
    );
    (inTitle ? setTitle : setBody)(text);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <GlassCard padding="lg" className="space-y-5">
        <p className="text-base font-semibold text-rf-text">{ANNOUNCEMENT_COPY.composeTitle}</p>
        <AudiencePicker
          token={token}
          self={self}
          targetKind={targetKind}
          onTargetKind={setTargetKind}
          programId={programId}
          onProgram={(id, name) => {
            setProgramId(id);
            setProgramName(name);
          }}
          memberIds={memberIds}
          onMemberIds={setMemberIds}
        />

        <label className="block space-y-2">
          <CountedLabel label={ANNOUNCEMENT_COPY.titleLabel} length={title.length} max={TITLE_MAX} />
          <input
            ref={titleRef}
            value={title}
            maxLength={TITLE_MAX}
            onFocus={() => (lastField.current = "title")}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={ANNOUNCEMENT_COPY.titlePlaceholder}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block space-y-2">
          <CountedLabel label={ANNOUNCEMENT_COPY.bodyLabel} length={body.length} max={BODY_MAX} />
          <textarea
            ref={bodyRef}
            value={body}
            rows={4}
            maxLength={BODY_MAX}
            onFocus={() => (lastField.current = "body")}
            onChange={(event) => setBody(event.target.value)}
            placeholder={ANNOUNCEMENT_COPY.bodyPlaceholder}
            className={`${FIELD_CLASS} resize-y`}
          />
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-rf-text-muted">{ANNOUNCEMENT_COPY.personalize}</span>
            {MERGE_FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                disabled={field === "program_name" && targetKind !== "program"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertField(field)}
                className="min-h-[44px] rounded-full border border-rf-border px-3 text-xs font-semibold text-rf-text disabled:opacity-40"
              >
                {ANNOUNCEMENT_COPY.mergeLabels[field]}
              </button>
            ))}
          </div>
          <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.personalizeHint}</p>
        </div>

        <DeliveryPicker mode={mode} onMode={setMode} date={date} onDate={setDate} time={time} onTime={setTime} />
        <AnnouncementPreviewPanel preview={preview} />

        {sentMessage && <p className="text-sm font-semibold text-rf-success">{sentMessage}</p>}
        {send.isError && <p className="text-sm font-semibold text-rf-danger">{announcementSendErrorMessage(send.error)}</p>}
        <button
          type="button"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
          className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {send.isPending ? ANNOUNCEMENT_COPY.sending : mode === "now" ? ANNOUNCEMENT_COPY.sendNow : ANNOUNCEMENT_COPY.schedule}
        </button>
      </GlassCard>

      <ConfirmDialog
        open={confirmOpen}
        title={ANNOUNCEMENT_COPY.confirmTitle}
        description={ANNOUNCEMENT_COPY.confirmBody(audienceText(targetKind, preview.recipientCount, programName), mode, date, time)}
        confirmLabel={mode === "now" ? ANNOUNCEMENT_COPY.sendNow : ANNOUNCEMENT_COPY.schedule}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (request && canSend) send.mutate(request);
        }}
      />
    </>
  );
}

function CountedLabel({ label, length, max }: { label: string; length: number; max: number }) {
  return (
    <span className="flex items-center justify-between text-sm font-semibold text-rf-text">
      {label}
      <span className="text-xs font-medium text-rf-text-muted">
        {length}/{max}
      </span>
    </span>
  );
}
