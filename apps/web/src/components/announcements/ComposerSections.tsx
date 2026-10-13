"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  SCHEDULE_MAX_DAYS,
  announcementErrorMessage,
  localDate,
  localTimeNow,
  previewAnnouncement,
  type AnnouncementRequest,
  type DeliveryMode
} from "@/lib/api/announcements";
import { KIT_COPY } from "@/lib/kit/copy";

// Sections of the announcement composer (ComposerForm): the "When" picker and the live preview.
const PREVIEW_DEBOUNCE_MS = 2_000; // the preview route allows 30 / min per admin (W15)
const MODES: DeliveryMode[] = ["now", "local"];
const FIELD_CLASS = "input-shell w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium";

/** "When": now, or a local date (today … +30 days) + time in each person's own time zone; warns when today's time has
 *  already passed for the sender. */
export function DeliveryPicker({
  mode,
  onMode,
  date,
  onDate,
  time,
  onTime
}: {
  mode: DeliveryMode;
  onMode: (mode: DeliveryMode) => void;
  date: string;
  onDate: (date: string) => void;
  time: string;
  onTime: (time: string) => void;
}) {
  const pastTime = mode === "local" && date === localDate(0) && time <= localTimeNow();
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-rf-text">{ANNOUNCEMENT_COPY.whenLabel}</p>
      <div className="segmented-control flex rounded-full p-1">
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            data-active={mode === value}
            onClick={() => onMode(value)}
            className="min-h-[44px] flex-1 rounded-full px-2 text-sm font-semibold transition"
          >
            {ANNOUNCEMENT_COPY.modes[value]}
          </button>
        ))}
      </div>
      {mode === "local" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={date}
              min={localDate(0)}
              max={localDate(SCHEDULE_MAX_DAYS)}
              onChange={(event) => onDate(event.target.value)}
              aria-label={ANNOUNCEMENT_COPY.dateLabel}
              className={FIELD_CLASS}
            />
            <input
              type="time"
              value={time}
              onChange={(event) => onTime(event.target.value)}
              aria-label={ANNOUNCEMENT_COPY.timeLabel}
              className={FIELD_CLASS}
            />
          </div>
          {pastTime && <p className="text-xs font-semibold text-rf-warning">{ANNOUNCEMENT_COPY.pastTime}</p>}
          <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.localHint}</p>
        </>
      )}
    </div>
  );
}

// The composer's live preview: re-rendered for a sample recipient 2 s after the last edit (cached per request body,
// no retries). W15: `current` only when the preview is for EXACTLY the request on screen (never a kept older one) —
// the composer's Send and its confirm count key off it. A 429 reads the composer's limit copy.
export function useAnnouncementPreview(token: string, request: AnnouncementRequest | null) {
  const requestJson = request ? JSON.stringify(request) : "";
  const [previewJson, setPreviewJson] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setPreviewJson(requestJson), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestJson]);

  const query = useQuery({
    queryKey: [...ANNOUNCEMENT_KEYS.preview, previewJson],
    queryFn: () => previewAnnouncement(token, JSON.parse(previewJson) as AnnouncementRequest),
    enabled: !!token && previewJson !== "",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false
  });
  const settled = request !== null && previewJson === requestJson && !query.isFetching;
  const current = settled && query.isSuccess && !query.isPlaceholderData;
  return {
    hasRequest: request !== null,
    data: query.data,
    error: settled && query.isError ? announcementErrorMessage(query.error) : null,
    current,
    recipientCount: current && query.data ? query.data.recipient_count : 0,
    retry: () => void query.refetch()
  };
}

export type AnnouncementPreviewState = ReturnType<typeof useAnnouncementPreview>;

export function AnnouncementPreviewPanel({ preview }: { preview: AnnouncementPreviewState }) {
  const { hasRequest, data, error, current } = preview;
  return (
    <div className="space-y-2 rounded-2xl border border-rf-border bg-rf-surface-muted p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{ANNOUNCEMENT_COPY.previewLabel}</p>
      {!hasRequest && <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.previewIncomplete}</p>}
      {error && (
        <p className="text-sm font-semibold text-rf-danger">
          {error}{" "}
          <button type="button" onClick={preview.retry} className="text-rf-accent">
            {KIT_COPY.retry}
          </button>
        </p>
      )}
      {hasRequest && !current && !error && (
        <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.previewLoading}</p>
      )}
      {hasRequest && data && !error && (
        <div className={current ? "space-y-2" : "space-y-2 opacity-60"}>
          <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.reach(data.recipient_count)}</p>
          {data.sample && (
            <div className="rounded-2xl bg-rf-surface p-3">
              <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.sampleFor(data.sample.first_name)}</p>
              <p className="mt-1 break-words text-sm font-semibold text-rf-text">{data.sample.title}</p>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-rf-text-muted">{data.sample.body}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
