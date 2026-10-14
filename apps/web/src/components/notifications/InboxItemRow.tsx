"use client";

import { NOTIFICATION_COPY, type InboxItem } from "@/lib/api/notifications";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Just now · 5m ago · 3h ago · Yesterday · Oct 12 · Oct 12, 2025 (the browser's time zone; same rule on the phones). */
export function inboxTimeLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 60) return NOTIFICATION_COPY.justNow;
  if (seconds < 3600) return NOTIFICATION_COPY.minutesAgo(Math.floor(seconds / 60));
  const day = startOfDay(date);
  if (day === startOfDay(now)) return NOTIFICATION_COPY.hoursAgo(Math.floor(seconds / 3600));
  if (day === new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()) return NOTIFICATION_COPY.yesterday;
  return date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
}

// One inbox row (notifications §3.9 rules 8 + 11): the card opens the item; the × removes it (web's idiom — the phones
// swipe). Two SIBLING buttons in one bordered card (a button inside a button is invalid HTML); the × is a 44 px target.
export function InboxItemRow({
  item,
  unread,
  onOpen,
  onRemove
}: {
  item: InboxItem;
  unread: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-full items-start rounded-2xl border border-rf-border bg-rf-surface transition hover:border-rf-accent/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl p-4 pr-1 text-left"
      >
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-rf-accent" : "bg-transparent"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold text-rf-text">{item.title}</span>
          {item.body && <span className="mt-1 block break-words text-sm text-rf-text-muted">{item.body}</span>}
          <span className="mt-1 block text-xs text-rf-text-muted">{inboxTimeLabel(item.created_at)}</span>
        </span>
        {unread && <span className="sr-only">{NOTIFICATION_COPY.unread}</span>}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={NOTIFICATION_COPY.removeLabel}
        className="m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-rf-text-muted transition hover:text-rf-text"
      >
        ×
      </button>
    </div>
  );
}
