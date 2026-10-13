# PLAN: Phase 4 Track P (web) — polish #9 #11 #15 #16 #17 #18 #19 #22 #23 #29 #30 #31 #33 #36 #37 #38 #39 #41 #43, plus every backend change rows #9–#45 need (revision 2)

**Brief accepted**: yes. 41 files: 1 backend and 40 web, of which 3 are new. Every file is on the brief's list. Blocking objection 1 is fixed without touching `Select.tsx`.

**Feature/version prediction**: four feature bumps, all in one orchestrator docs commit. Page SPECs get PATCH bumps with no tags.
- **frontend-kit 0.4.0 → 0.5.0** (MINOR; 0.4.0 has already landed in registry.json). New web file `components/kit/QueryView.tsx`, plus rules D-KIT-20 and D-KIT-21.
- **programs 0.2.0 → 0.3.0** (MINOR). New D-C3: the server's create guard returns 400 when start ≥ end.
- **auth 0.14.0 → 0.15.0** (MINOR). New D-C18: a retry after a successful sign-up only signs in.
- **program-memberships 0.3.0 → 0.3.1** (PATCH). New D-C6: web and iOS stop sending `is_active`; the server still accepts it.

**Surfaces in scope**: [backend, web]. The two file sets are disjoint. iOS and Android are owned by the parallel Track P runs.

## Revision notes (adversary objections → fixes)
1. **[BLOCKING] #1: Escape could close the desktop bulk-log modals and lose the rows.**
   - `Modal` gains a `closeOnEscape` prop (default `true`).
   - Escape is ignored when focus sits outside the panel (for example a Select's search box portaled to `<body>`) or when the event was already handled.
   - `summary/page.tsx` sets `closeOnEscape={false}` on both log-form modals (steps 4 and 41).
2. **[BLOCKING] #2: nested buttons inside a `role="button"` card.**
   - The card div keeps its plain mouse `onClick` and gets no role, tabIndex or key handler.
   - The program name becomes a real `<button>` inside the `<h3>` (step 43).
3. Muted text goes to `#646a76` (about 4.9:1 on the page background, 4.8:1 on muted surfaces). The health card gradient becomes `from-sky-700 to-blue-700` (about 5.9:1).
4. No opacity modifiers on `var()` colours:
   - The program-name focus ring is `ring-rf-accent`.
   - The members Delete pills use the existing `danger-pill` class.
5. Support opens `/support` in a new tab, as the phones open it externally. Both menus.
6. QueryView calls `useRefetchOnReconnect([query])`.
7. IconSteps gets a `<span style>` wrap, now mandatory. The summary replace range is exactly :629-631.
8. #17: once register has succeeded, the Back button is hidden. This is recorded in auth D-C18.
9. The docs gates (owned-interface acknowledgement, the programs page D-REL7 superseding :126, D-number assignment order) are listed under Endgame step 49.
10. Debt for large files is recorded under Risks.

## Decisions on the brief's open questions (orchestrator may veto)
1. **#38 server guard on create: YES.** About 4 lines, and it protects iOS 1.4.2 and 1.5.0 immediately.
2. **Darken `--rf-text-muted` globally: YES, to `#646a76`.** To veto, skip step 11a.
3. **Same-file collisions: serialize.** P-web lands first. N3 (programs/page.tsx, program/page.tsx, icons/index.tsx) and People S2 (program/profile/page.tsx) rebase onto it.
4. **Shared `AccountMenuRows.tsx`: NO.** It would be a file outside the brief. The rows go inline in both menus, and N3 adds Inbox and Notifications the same way.
5. **#29 siblings: YES.** QueryView also goes on members/streaks, lifestyle/steps-timeline, program/roles and members/metrics.
6. **#15 edge case: accept.** A retry after an unseen successful delete gets a 401 and shows the kit's `signedOut` copy, which is accurate.

## Row status after checking the tree
- No row is fully fixed already.
- Partly done by the quick wins: #15 (copy), #22 (order-error copy), #29 (plain messages), #30 ("—" on failure). Only the remainders are planned below.
- #19 also covers `summary/log-health`.
- `auth-provider.tsx` needs no change.
- The `members/list` "Inactive" badge is dead code and is left for People S2.

## Backend verdicts for rows #9–#45 (only #38 changes code)
| Row | Verdict |
|---|---|
| #9 | No change. `deleteCustomWorkout` already returns 400 with "Cannot delete this workout. It has N workout log(s)… Consider hiding it instead." (workoutService.js:211-225). |
| #11 | No change. `is_active` stays optional (membershipService.js:229-231). |
| #12 | No change. The client judges success by the save itself. |
| #17 | No change. The client remembers the successful register. |
| #24 | No change. A second DELETE returning 404 is correct; the client disables its buttons. |
| #27 | No change. `loadAccess` already answers `skipped_not_member` (healthSyncService.js:134-161). Clients filter `my_status == "active"`. |
| #44 | No change. `updateMember` clears on an explicit JSON `null` (memberService.js:138-139). iOS sends `NSNull()`; Android uses a JsonObject body (ApiService.kt:241 precedent). S0 files are not touched. |

## Steps — backend
1. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/programService.js`, in `createProgram`.
   - Insert after `const programStatus = status && validStatuses.includes(status) ? status : "planned";` (:99) and before `const transaction = await sequelize.transaction();` (:101).
   - `updateProgram` stays unchanged.
```js

    // Polish #38 (programs D-C3): start must be strictly before end when both are given, the rule every edit screen
    // already enforces (a start >= end program sits at 0% forever). Checked BEFORE the transaction: the catch below
    // turns every error into a 500. Compares the yyyy-MM-dd prefix every client sends.
    if (start_date && end_date && String(start_date).slice(0, 10) >= String(end_date).slice(0, 10)) {
        throw new AppError(400, "End date must be after the start date.");
    }
```

## Steps — web (all paths under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/`)

### A. Shared building blocks

**1. NEW `components/kit/QueryView.tsx`** (the #29 helper; it also exports `InlineLoadError` for #16 and #18):
```tsx
"use client";

import type { ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { LoadingState } from "@/components/ui/LoadingState";
import { appError, type AppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { KIT_COPY } from "@/lib/kit/copy";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";

/** A useQuery result: the fields fromQuery reads + refetch (for the reconnect rule). */
type ViewableQuery<T> = QueryLike<T> & { refetch: (options?: { cancelRefetch?: boolean }) => Promise<unknown> };

// The ONE detail-screen helper (polish #29, frontend-kit D-KIT-20) = the Summary recipe for a single query:
// loading → LoadingState · failed → ErrorView + Retry (the offline copy while offline, polish-1 rule 6) ·
// stale → content + "Couldn't refresh · Retry" (hidden while the global offline banner shows, A6) · loaded → content.
// A failed read refetches by itself when the connection comes back (D-KIT-13). idle (a disabled query) renders nothing.
// Render it at page level, never inside a .glass-card (the stale banner is position: fixed).
export function QueryView<T>({
  query,
  queryKey,
  loadingMessage,
  children
}: {
  query: ViewableQuery<T>;
  /** The query's exact key: Retry cancels a live retryer first (retryNow, D-KIT-18). */
  queryKey: QueryKey;
  loadingMessage?: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  useRefetchOnReconnect([query]);
  const state = fromQuery(query);
  const retry = () => void retryNow(queryClient, queryKey);

  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return online ? <LoadingState message={loadingMessage} /> : <ErrorView error={appError("offline")} onRetry={retry} />;
  }
  if (state.status === "failed") {
    return <ErrorView error={online ? state.error : appError("offline")} onRetry={retry} />;
  }
  return (
    <>
      {children}
      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retry} />
        </>
      )}
    </>
  );
}

/**
 * Compact "Couldn't load this · Retry" line for one part of a form or card whose read failed (polish #16 / #18):
 * never an empty list or a guessed value. Retry only when the error is retryable (the ErrorView rule).
 */
export function InlineLoadError({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  const online = useOnlineStatus();
  const shown = online ? error : appError("offline");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-rf-surface-muted px-4 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rf-text">{KIT_COPY.errorViewTitle}</p>
        <p className="break-words text-xs text-rf-text-muted">{shown.message}</p>
      </div>
      {shown.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 font-semibold text-rf-accent transition hover:text-rf-accent-strong"
        >
          {KIT_COPY.retry}
        </button>
      )}
    </div>
  );
}
```

**2. NEW `lib/hooks/use-log-lookups.ts`** (#16):
```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProgramMembers, fetchPrograms, type Member, type Program } from "@/lib/api/programs";
import { fetchProgramWorkouts, type ProgramWorkout } from "@/lib/api/program-workouts";
import { toAppError, type AppError } from "@/lib/kit/app-error";
import { subscribeReconnect } from "@/lib/kit/use-online-status";

// The log forms' pickers (polish #16): the program's members, the member's programs and, for the workout form, the
// program's visible workout types, loaded together. A failed load is an ERROR ("Couldn't load this · Retry"), never
// an empty list that reads "No workout types"; it reloads by itself when the connection comes back (D-KIT-13).
// Lists from an earlier good load are kept.

export type LogLookups = {
  members: Member[];
  workouts: ProgramWorkout[];
  programs: Program[];
  /** A load has succeeded: only then is an empty list really empty. */
  loaded: boolean;
  /** The latest load failed. */
  error: AppError | null;
  reload: () => void;
};

const NO_WORKOUTS: ProgramWorkout[] = [];

export function useLogLookups(token: string, programId: string, withWorkouts: boolean): LogLookups {
  const [members, setMembers] = useState<Member[]>([]);
  const [workouts, setWorkouts] = useState<ProgramWorkout[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!token || !programId) return;
    let active = true;
    setError(null);
    Promise.all([
      fetchProgramMembers(token, programId),
      withWorkouts ? fetchProgramWorkouts(token, programId) : Promise.resolve(NO_WORKOUTS),
      fetchPrograms(token)
    ])
      .then(([membersData, workoutsData, programsData]) => {
        if (!active) return;
        setMembers(membersData);
        setWorkouts(workoutsData.filter((workout) => !workout.is_hidden));
        setPrograms(programsData);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (active) setError(toAppError(err));
      });
    return () => {
      active = false;
    };
  }, [token, programId, withWorkouts, attempt]);

  // Back online after a failed load → load again.
  useEffect(() => {
    if (!error) return;
    return subscribeReconnect(reload);
  }, [error, reload]);

  return { members, workouts, programs, loaded, error, reload };
}
```

**3. NEW `components/MemberPickerModal.tsx`** (#36). Extracted from lifestyle :618-688, with 44 px rows and a selected state:
```tsx
"use client";

import { useState } from "react";
import type { Member } from "@/lib/api/programs";
import { Modal } from "@/components/ui/Modal";

// The shared "View as" member picker (polish #36: 44 px rows + a selected state). Extracted from the Lifestyle tab;
// the Members tab adopts it in People S5.
export function MemberPickerModal({
  open,
  members,
  selected,
  allowNone,
  noneLabel,
  onClose,
  onSelect
}: {
  open: boolean;
  members: Member[];
  selected: Member | null;
  allowNone: boolean;
  noneLabel: string;
  onClose: () => void;
  onSelect: (member: Member | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((member) =>
    member.member_name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const rowClass =
    "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-rf-surface-muted";

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-rf-text">View as</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text-muted"
          >
            Done
          </button>
        </div>
        <div className="mt-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search member"
            aria-label="Search member"
            className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
        <div
          className="mt-4 max-h-[min(70vh,20rem)] overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {allowNone && (
            <button
              type="button"
              aria-pressed={selected === null}
              onClick={() => onSelect(null)}
              className={`${rowClass} ${selected === null ? "text-rf-text" : "text-rf-text-muted"}`}
            >
              <span>{noneLabel}</span>
              {selected === null && <span aria-hidden="true" className="text-rf-accent">✓</span>}
            </button>
          )}
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              aria-pressed={selected?.id === member.id}
              onClick={() => onSelect(member)}
              className={`${rowClass} text-rf-text`}
            >
              <span className="min-w-0 truncate">{member.member_name}</span>
              {selected?.id === member.id && <span aria-hidden="true" className="text-rf-accent">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
```

**4. `components/ui/Modal.tsx`** (#37 + objection 1). Replace the whole file with:
```tsx
"use client";

import { useEffect, useId, useRef } from "react";

// Shared pop-up (polish #37): announced as a modal dialog (named by its first heading), Escape closes the TOPMOST open
// one, focus moves into it on open (unless a child already took it, e.g. autoFocus) and returns to the opener on
// close. Every Modal and ConfirmDialog inherits this. The panel itself takes focus, so no mobile keyboard pops up.
// Escape is left alone when focus sits OUTSIDE the panel (a Select's search box is portaled to <body> and owns its
// Escape) and when `closeOnEscape` is false (forms whose loss would hurt, e.g. the desktop bulk-log forms).
const openModals: object[] = [];

export function Modal({
  open,
  onClose,
  closeOnEscape = true,
  children
}: {
  open: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const entry = {};
    openModals.push(entry);
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    body.style.overflow = "hidden";
    body.classList.add("modal-open");

    const panel = panelRef.current;
    if (panel) {
      const heading = panel.querySelector<HTMLElement>("h1, h2, h3");
      if (heading) {
        if (!heading.id) heading.id = titleId;
        panel.setAttribute("aria-labelledby", heading.id);
      }
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (openModals[openModals.length - 1] !== entry) return; // only the topmost pop-up
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && !panelRef.current?.contains(focused)) return;
      if (!closeOnEscapeRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openModals.splice(openModals.indexOf(entry), 1);
      body.style.overflow = previousOverflow;
      if (openModals.length === 0) body.classList.remove("modal-open");
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, titleId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative z-10 flex min-h-0 w-full max-h-[90dvh] justify-center overflow-auto outline-none"
      >
        {children}
      </div>
    </div>
  );
}
```

**5. `components/ui/ConfirmDialog.tsx`** (#9 / #22 / #36). Replace the whole file. The default `closeOnConfirm=true` keeps today's behaviour for every existing caller.
```tsx
"use client";

import { Modal } from "./Modal";

// `closeOnConfirm={false}` (polish #9): the dialog stays open while the caller's action runs. It shows `loadingLabel` on
// the disabled confirm button and the failure in `errorMessage` inside the dialog; the caller closes it on success.
// The default (true) keeps the old close-at-once behavior.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  loadingLabel = "Please wait…",
  errorMessage = null,
  closeOnConfirm = true,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  errorMessage?: string | null;
  closeOnConfirm?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-surface w-full max-w-md rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-rf-text">{title}</h3>
        <p className="mt-2 text-sm text-rf-text-muted">{description}</p>
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm font-semibold text-rf-danger">
            {errorMessage}
          </p>
        )}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="pill-button min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onConfirm();
              if (closeOnConfirm) onClose();
            }}
            className={`min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
              danger ? "danger-pill" : "button-primary button-primary--dark-white"
            }`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**6. `components/BackButton.tsx`** (#36). Default `className` (:9):
- Before: `"back-button inline-flex rounded-full px-3 py-1 text-xs font-semibold text-rf-text-muted transition"`
- After: `"back-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-rf-text-muted transition"`

**7. `components/ui/Button.tsx`** (#36). At :14:
- Before: `sm: "rounded-full px-3 py-1 text-xs font-semibold",`
- After: `sm: "rounded-full px-4 min-h-[44px] text-sm font-semibold",`

**8. `components/ui/PeriodSelector.tsx`** (#36):
- After `DEFAULT_PERIODS` (:10) add:
```tsx

// Screen-reader names for the one-letter segments (polish #36).
const PERIOD_NAMES: Record<PeriodKey, string> = { week: "Week", month: "Month", year: "Year", program: "Program" };
```
- Replace the returned JSX (:21-34) with:
```tsx
    <div role="group" aria-label="Period" className="segmented-control flex rounded-full p-1">
      {periods.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          data-active={value === item.key}
          aria-pressed={value === item.key}
          aria-label={PERIOD_NAMES[item.key]}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition"
        >
          {item.label}
        </button>
      ))}
    </div>
```

**9. `components/GoogleSignInButton.tsx`** (#23):
- After :4 add `import { subscribeReconnect } from "@/lib/kit/use-online-status";`.
- In `loadGsi`, replace `script.onerror = () => reject(new Error("gsi load failed"));` (:38) with:
```tsx
    script.onerror = () => {
      script.remove(); // polish #23: a failed tag must not stay behind; every later attempt would wait on it forever
      reject(new Error("gsi load failed"));
    };
```
- After `const [ready, setReady] = useState(false);` (:84) add `const [attempt, setAttempt] = useState(0);`.
- Replace the whole `useEffect` (:86-114) with:
```tsx
  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const retry = () => {
      if (!cancelled) setAttempt((n) => n + 1);
    };

    loadGsi()
      .then(() => {
        if (cancelled || !window.google?.accounts?.oauth2) return;
        codeClientRef.current = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_WEB_CLIENT_ID,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: (response: { code?: string; error?: string }) => {
            if (response?.code) onCode(response.code);
            else if (response?.error && response.error !== "access_denied") onProviderErrorRef.current?.(response.error);
          },
          error_callback: (error: { type?: string }) => {
            if (error?.type !== "popup_closed") onProviderErrorRef.current?.(error?.type ?? "unknown");
          }
        });
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // polish #23: GSI unavailable (offline/blocked). Try again when the connection comes back or the tab regains focus.
        unsubscribe = subscribeReconnect(retry);
        window.addEventListener("focus", retry, { once: true });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      window.removeEventListener("focus", retry);
    };
  }, [onCode, attempt]);
```

**10. `components/icons/index.tsx`** (#41). Insert after `IconDocument` (ends :149):
```tsx

export function IconHelp({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="8" />
      <path d="M7.8 7.6a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.9-2.2 3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="14.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
```

### B. #43 colours

**11. `app/globals.css`**:
- a. In `:root`, change `--rf-text-muted: #7c828e;` (:14) to `--rf-text-muted: #646a76;`. This is the veto point for decision 2. The dark value is unchanged.
- b. In `:root`, after `--rf-warning: #f59e0b;` (:20) insert:
```css
  /* polish #43: dark-aware accent TEXT shades (Lifestyle cards); the bright hues fail contrast on light cards */
  --rf-accent-amber: #b45309;
  --rf-accent-violet: #7c3aed;
  --rf-accent-red: #dc2626;
  --rf-accent-green: #15803d;
  --rf-accent-teal: #0f766e;
```
- c. In `[data-theme="dark"]`, after `--rf-warning: #fbbf24;` (:44) insert:
```css
  --rf-accent-amber: #f59e0b;
  --rf-accent-violet: #a78bfa;
  --rf-accent-red: #f87171;
  --rf-accent-green: #22c55e;
  --rf-accent-teal: #14b8a6;
```
- d. In `.error-banner` (:159-162), change `color: var(--rf-danger);` to `color: #dc2626;`. The dark rule is unchanged.
- e. After the `[data-theme="dark"] .info-banner { … }` block (ends :179) insert:
```css

/* polish #43: dark-aware replacements for the light-only emerald / amber boxes on the sign-in pages */
.success-banner {
  background: rgba(47, 184, 97, 0.1);
  color: #047857;
  border: 1px solid rgba(47, 184, 97, 0.3);
}

[data-theme="dark"] .success-banner {
  background: rgba(54, 197, 111, 0.12);
  color: #6ee7b7;
  border: 1px solid rgba(54, 197, 111, 0.35);
}

.warning-banner {
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

[data-theme="dark"] .warning-banner {
  background: rgba(251, 191, 36, 0.12);
  color: #fcd34d;
  border: 1px solid rgba(251, 191, 36, 0.35);
}
```

**12. `app/login/page.tsx`** (#43):
- The session-message div (:148-154): replace its className template with:
```tsx
            className={`mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold ${
              passwordWasReset ? "success-banner" : "warning-banner"
            }`}
```
- The error div (:196):
  - Before: `className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"`
  - After: `className="error-banner rounded-2xl px-4 py-3 text-sm font-semibold"`

**13. `app/forgot-password/page.tsx`** (#43):
- The emerald box:
  - Before: `className="mt-10 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 sm:text-base"`
  - After: `className="success-banner mt-10 w-full rounded-2xl px-4 py-4 text-sm font-semibold sm:text-base"`
- The red error box: its className becomes `"error-banner rounded-2xl px-4 py-3 text-sm font-semibold"`.

**14. `app/reset-password/page.tsx`** (#43). Anchor on text; Q edited this file.
- The emerald box: className becomes `"success-banner mt-10 w-full rounded-2xl px-4 py-4 text-sm font-semibold sm:text-base"`.
- The amber `linkError` box:
  - Before: `"rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 sm:text-base"`
  - After: `"warning-banner rounded-2xl px-4 py-4 text-sm font-semibold sm:text-base"`
- The red error box: className becomes `"error-banner rounded-2xl px-4 py-3 text-sm font-semibold"`.

### C. Auth pages

**15. `app/create-account/page.tsx`** (#17, #43):
- After the `credentialErrorMessage` import (:24) add `import { ApiError } from "@/lib/api/client";`.
- After `const EMAIL_RE = …;` (:36) add:
```tsx

// polish #17: the server's 400 "Username already exists" / "Email already exists" belongs to the username step.
function isTakenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && /already exists/i.test(error.message);
}
```
- After `const [errorMessage, setErrorMessage] = …` (:59) add:
```tsx
  // polish #17 (auth D-C18): once register succeeded, a retry only signs in with the registered credentials (a second
  // register would answer "already exists"), and Back is hidden: the account exists, earlier steps can't change it.
  // Memory only; never persisted.
  const [registeredAs, setRegisteredAs] = useState<{ username: string; password: string } | null>(null);
```
- Replace `submitEmail` (:183-206) with:
```tsx
  const submitEmail = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    let registered = registeredAs !== null;
    const credentials = registeredAs ?? { username: username.trim(), password };
    try {
      if (!registeredAs) {
        await registerAccount({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: credentials.username,
          email: trimmedEmail,
          password: credentials.password,
          ...(gender.trim().length > 0 ? { gender: gender.trim() } : {})
        });
        registered = true;
        setRegisteredAs(credentials);
      }
      // register returns no session token (auth SPEC §3): sign in immediately (faithful auto-login).
      const response = await login(credentials.username, credentials.password);
      applyLogin(response);
    } catch (error) {
      if (registered) reportSignInFailure("password", error);
      else if (isTakenError(error)) setStep(2); // polish #17: show it on the username/email step
      setErrorMessage(credentialErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };
```
- Back button guard (:444): change `{step > 1 && (` to `{step > 1 && !registeredAs && (`.
- #43, the error div (:436-440):
  - Before: `className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"`
  - After: `className="error-banner rounded-2xl px-4 py-3 text-sm font-semibold"`

### D. #19: wait for the session before any role redirect (10 pages)
On each page:
- (a) Add `isBootstrapping` to the `useAuthGuard()` destructure.
- (b) Make the redirect effect start with this guard line, and add `isBootstrapping, session` to its deps:
```tsx
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
```

**16. `app/members/history/page.tsx`**:
- :32 becomes `const { session, program, token, programId, isBootstrapping } = useAuthGuard();`
- The effect at :38-43 becomes:
```tsx
  useEffect(() => {
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
    if (!memberId) return;
    if (!canViewAny && memberId !== loggedInUserId) {
      router.push("/members");
    }
  }, [isBootstrapping, session, memberId, canViewAny, loggedInUserId, router]);
```

**17. `app/members/streaks/page.tsx`**: same pattern. Destructure at :23; the effect at :28-33 gets step 16's body and deps.

**18. `app/members/workouts/page.tsx`**: destructure at :41; the effect at :71-76 is identical to step 16.

**19. `app/members/health/page.tsx`**: destructure at :56; the effect at :86-91 is identical to step 16.

**20. `app/members/detail/page.tsx`**:
- :24 becomes `const { session, token, programId, isBootstrapping } = useAuthGuard();`
- The effect at :33-37 becomes:
```tsx
  useEffect(() => {
    if (isBootstrapping || !session) return; // polish #19: judge roles only once the session is restored
    if (!isGlobalAdmin) {
      router.push("/members");
    }
  }, [isBootstrapping, session, isGlobalAdmin, router]);
```

**21. `app/members/invite/page.tsx`**:
- :13 becomes `const { session, program, token, programId, isBootstrapping } = useAuthGuard();`
- The effect at :21-25: the guard line, then the existing `if (!isProgramAdmin) router.push("/members");`.
- Deps: `[isBootstrapping, session, isProgramAdmin, router]`.

**22. `app/program/edit/page.tsx`**:
- The destructure at :24 adds `isBootstrapping`.
- The effect at :35-39: the guard line, then the existing `if (program?.id && !isProgramAdmin) router.push("/program");`.
- Deps: `[isBootstrapping, session, program?.id, isProgramAdmin, router]`.

**23. `app/program/roles/page.tsx`**: destructure at :19; the effect at :29-33 exactly as step 22.

**24. `app/summary/log-workout/page.tsx`**:
- The destructure at :18 adds `isBootstrapping`.
- The effect at :27-31: the guard line, then `if (program?.id && dataEntryLocked) router.replace("/summary");`.
- Deps: `[isBootstrapping, session, program?.id, dataEntryLocked, router]`.

**25. `app/summary/log-health/page.tsx`**: :18 and :27-31 exactly as step 24.

### E. #29: detail screens through QueryView
On each page:
- Import `import { QueryView } from "@/components/kit/QueryView";` and remove the now-unused imports listed for that page.
- Hoist the query key into a `const` with the IDENTICAL value, and use it in `useQuery`.
- Replace the `isLoading` / `isError` lines with the QueryView opening tag.
- Close the tag after the existing `{query.data && (…)}` block, which stays unchanged inside.

**26. `app/summary/activity/page.tsx`**:
- Remove the `toAppError`, `LoadingState` and `ErrorState` imports.
- Key: `const timelineKey = ["summary", "timeline", programId, period];`
- Replace :40-46 with `<QueryView query={timelineQuery} queryKey={timelineKey} loadingMessage="Loading timeline...">`.
- Add `</QueryView>` after :87.

**27. `app/summary/distribution/page.tsx`**:
- Same import removals.
- Key: `const distributionKey = ["summary", "distribution", programId];`
- Replace :49-55 with `<QueryView query={distributionQuery} queryKey={distributionKey} loadingMessage="Loading distribution...">`.
- Close after :81.

**28. `app/summary/workout-types/page.tsx`**:
- Same import removals.
- Key: `const typesKey = ["summary", "workoutTypes", programId];`
- Replace :36-42 with `<QueryView query={typesQuery} queryKey={typesKey} loadingMessage="Loading workout types...">`.
- Close after :97.

**29. `app/members/history/page.tsx`**:
- Same import removals.
- Key: `const historyKey = ["members", "history", programId, memberId, period];`
- Replace :59-61 with `<QueryView query={historyQuery} queryKey={historyKey} loadingMessage="Loading timeline...">`.
- Close after :99.

**30. `app/members/streaks/page.tsx`**:
- Same import removals.
- Key: `const streaksKey = ["members", "streaks", programId, memberId];`
- Replace :45-47 with `<QueryView query={streaksQuery} queryKey={streaksKey} loadingMessage="Loading streaks...">`.
- Close after :85.

**31. `app/lifestyle/timeline/page.tsx`**:
- Same import removals.
- Key: `const timelineKey = ["lifestyle", "timeline", programId, resolvedMemberId ?? "program", period];`
- Replace :64-68 with `<QueryView query={timelineQuery} queryKey={timelineKey} loadingMessage="Loading timeline...">`.
- Close after :133.

**32. `app/lifestyle/steps-timeline/page.tsx`**:
- Same import removals.
- Key: `const timelineKey = ["lifestyle", "steps-timeline", programId, resolvedMemberId ?? "program", period];`
- Replace :65-69 with `<QueryView query={timelineQuery} queryKey={timelineKey} loadingMessage="Loading timeline...">`.
- Close after :114.

**33. `app/program/roles/page.tsx`**:
- Remove the `LoadingState` and `ErrorState` imports. `toAppError` stays.
- Replace :99-101 with `<QueryView query={membersQuery} queryKey={rolesQueryKey} loadingMessage="Loading roles...">`.
- Close after :162.
- #36: the RoleButton className (:199) becomes `` `inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 text-sm font-semibold transition ${ … } …` `` (keep the two existing interpolations). Add `aria-pressed={active}` to the `<button>`.

**34. `app/members/metrics/page.tsx`** (#29, #39):
- Imports:
  - Remove `toAppError`, `LoadingState` and `ErrorState`.
  - Add QueryView, and `fromQuery` from `@/lib/kit/async-state`.
  - :7 becomes `import { initials, downloadCsv, stepsLabel } from "@/lib/format";`.
- Key: `const metricsKey = ["members", "metrics", programId, search, sortField, direction, JSON.stringify(filterParams)];`, used in `useQuery`.
- PageHeader subtitle: `subtitle={metricsQuery.data ? `${metricsQuery.data.filtered} members` : fromQuery(metricsQuery).status === "failed" ? undefined : "Loading metrics..."}`.
- Replace :186-188 with `<QueryView query={metricsQuery} queryKey={metricsKey} loadingMessage="Loading metrics...">`.
- Add `</QueryView>` after the members-grid block's `)}`.
- #39: in `MemberMetricsCard`'s `heroValue`, insert before `default:`:
```tsx
      case "avg_steps":
        // polish #39: Avg Steps sorts the list, so it is the big number; "—" when missing or hidden (S0 nulls it).
        return metric.avg_steps == null ? "—" : stepsLabel(Math.round(metric.avg_steps));
```

**35. `app/members/detail/page.tsx`** (#11, #29):
- Imports:
  - Remove `LoadingState` and `ErrorState`.
  - Add QueryView and `import { ErrorView } from "@/components/kit/ErrorView";`.
  - :10 becomes `import { appError, toAppError } from "@/lib/kit/app-error";`.
- #11, delete all of the following. The PUT then sends only `program_id`, `member_id` and `joined_at`.
  - `const [isActive, setIsActive] = useState(true);` (:28)
  - `setIsActive(member.is_active ?? true);` (:54)
  - `is_active: isActive` (:66), plus the trailing comma after `joined_at: joinedAt || null`
  - the whole `<label …>` checkbox block (:133-143)
- Key: `const detailsKey = ["members", "details", programId];`, used in `useQuery`.
- Replace :95-99 with:
```tsx
      {!memberId && <ErrorView error={appError("notFound")} />}

      <QueryView query={membersQuery} queryKey={detailsKey} loadingMessage="Loading member...">
        {member ? (
```
- Replace the block's closing `)}` (:167) with:
```tsx
        ) : (
          <ErrorView error={appError("notFound")} />
        )}
      </QueryView>
```

### F. #9 / #29 / #36: the three list pages with pop-ups

Shared classNames used in this section:
- `MUTED_PILL` = `"inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text-muted"`
- `DANGER_PILL` = `"danger-pill inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"`

Inline the literal strings; do not add constants.

**36. `app/members/workouts/page.tsx`**:
- Imports: remove `LoadingState`; add QueryView.
- Replace `const [errorMessage, setErrorMessage] = useState<string | null>(null);` (:69) with:
```tsx
  // polish #9: each error shows where the user is looking, inside the edit pop-up or the delete dialog.
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```
- `deleteMutation` (:133-147): `onSuccess` and `onError` become:
```tsx
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["members", "workouts", programId, memberId] });
    },
    onError: (error) => {
      setDeleteError(toAppError(error).message);
    }
```
- `updateMutation.onError` becomes `setEditError(toAppError(error).message);`.
- `openEdit`: `setErrorMessage(null)` becomes `setEditError(null)`.
- `submitEdit`:
  - `setErrorMessage("Enter a valid duration before saving.")` becomes `setEditError(…)` with the same text.
  - Add `setEditError(null);` right before `updateMutation.mutate(durationValue);`.
- Key: `const workoutsKey = ["members", "workouts", programId, memberId, sortField, sortDir, startDate, endDate, workoutType, minDurationNum, maxDurationNum];`, used as `queryKey: workoutsKey`.
- Delete the page-level `{errorMessage && <p …>{errorMessage}</p>}` (:248).
- Replace `{workoutsQuery.isLoading && <LoadingState message="Loading workouts..." />}` (:250) with `<QueryView query={workoutsQuery} queryKey={workoutsKey} loadingMessage="Loading workouts...">`.
- Add `</QueryView>` after the list block's `)}` (:290).
- In the edit modal, insert immediately before `<div className="mt-6 flex items-center justify-end gap-3">`:
```tsx
            {editError && <p role="alert" className="mt-4 text-sm font-semibold text-rf-danger">{editError}</p>}
```
- Row Delete onClick: `() => { setDeleteError(null); setDeleteTarget(item); }`.
- Replace the ConfirmDialog (:478-489) with:
```tsx
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete workout log?"
        description={deleteTarget ? `Delete the ${deleteTarget.workoutType} log from ${deleteTarget.workoutDate}?` : ""}
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
        loadingLabel="Deleting…"
        errorMessage={deleteError}
        closeOnConfirm={false}
        onConfirm={() => {
          setDeleteError(null);
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
```
- #36 classNames:
  - Export CSV (:222): `"pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition disabled:opacity-40"`
  - Row Edit (:274): MUTED_PILL
  - Row Delete (:281): DANGER_PILL (replaces the inert `bg-rf-danger/10`)
  - Filter Done (:299), Clear all (:392), edit Close (:408) and edit Cancel (:461): MUTED_PILL
  - Edit Save (:469): `"button-primary inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-semibold"`

**37. `app/members/health/page.tsx`**: same as step 36, with these differences:
- `editError` and `deleteError` replace `errorMessage` (:84).
- The three `submitEdit` validation messages (:263, :267, :271) and `updateMutation.onError` call `setEditError(…)`. Add `setEditError(null);` before `updateMutation.mutate(`.
- `openEdit` calls `setEditError(null)`.
- `deleteMutation` `onSuccess` / `onError` as in step 36, with invalidate key `["members", "health", programId, memberId]`.
- Key: `const healthKey = ["members", "health", programId, memberId, sortField, sortDir, startDate, endDate, minSleepHoursNum, maxSleepHoursNum, minDietNum, maxDietNum, minStepsNum, maxStepsNum];`
- Delete :318.
- Replace :320 with `<QueryView query={healthQuery} queryKey={healthKey} loadingMessage="Loading daily health logs...">`, and close it after :360.
- Insert the `editError` line before `<div className="mt-6 flex items-center justify-end gap-3">` (:575).
- Row Delete onClick: `() => { setDeleteError(null); setDeleteTarget(item); }`.
- ConfirmDialog (:596-607): title `"Delete daily health log?"`, description unchanged, then step 36's props:
  - `confirmLabel="Delete"`, `danger`
  - `loading={deleteMutation.isPending}`, `loadingLabel="Deleting…"`
  - `errorMessage={deleteError}`, `closeOnConfirm={false}`
  - the same `onConfirm` / `onClose` shape
- Remove the `LoadingState` import.
- #36 classNames:
  - :292: the Export CSV string from step 36
  - :344, :369, :497, :513, :579: MUTED_PILL
  - :351: DANGER_PILL
  - :587: the Save string from step 36

**38. `app/lifestyle/workouts/page.tsx`**:
- Imports: remove `LoadingState`; add QueryView.
- After the `errorMessage` state (:37) add:
```tsx
  // polish #9: add / edit / delete errors show inside their own pop-up; errorMessage stays for the row toggles.
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```
- Key: `const workoutsKey = ["lifestyle", "workouts", programId];` before `useQuery`. Use it in `useQuery` and in `refreshWorkouts`.
- `addCustomMutation.onError` becomes `setAddError(toAppError(error).message);`.
- `editCustomMutation.onError` becomes `setEditError(toAppError(error).message);`.
- `deleteCustomMutation` becomes:
```tsx
  const deleteCustomMutation = useMutation({
    mutationFn: (id: string) => deleteCustomProgramWorkout(token, id),
    onSuccess: () => {
      setDeleteTarget(null);
      void refreshWorkouts();
    },
    onError: (error) => {
      setDeleteError(toAppError(error).message);
    }
  });
```
- Header add button:
  - onClick: `setErrorMessage(null); setAddError(null); setShowAdd(true);`
  - className (:131): `"inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-4 text-sm font-semibold text-black shadow"`
- Both `onEdit` props: `setErrorMessage(null); setEditError(null); setEditTarget(workout);`.
- Both `onDelete` props: `(workout) => { setDeleteError(null); setDeleteTarget(workout); }`.
- Replace :150-152 with:
```tsx
        <QueryView query={workoutsQuery} queryKey={workoutsKey} loadingMessage="Loading workout types...">
        {workoutsQuery.data && (
```
  Then add `</QueryView>` after :188.
- Add modal:
  - Above the Add button (:213) insert `{addError && <p role="alert" className="text-sm font-semibold text-rf-danger">{addError}</p>}`.
  - Add button onClick: `() => { setAddError(null); addCustomMutation.mutate(newWorkoutName.trim()); }`.
- Edit modal:
  - Above "Save changes" (:248) insert `{editError && <p role="alert" className="text-sm font-semibold text-rf-danger">{editError}</p>}`.
  - "Save changes" onClick: `() => { setEditError(null); editCustomMutation.mutate({ id: editTarget.id, name: editWorkoutName.trim() }); }`.
- ConfirmDialog (:261-272):
  - `title="Delete workout"`, description unchanged, `confirmLabel="Delete"`, `danger`
  - `loading={deleteCustomMutation.isPending}`, `loadingLabel="Deleting…"`
  - `errorMessage={deleteError}`, `closeOnConfirm={false}`
  - `onConfirm={() => { setDeleteError(null); if (deleteTarget) deleteCustomMutation.mutate(deleteTarget.id); }}`
  - `onClose={() => { setDeleteTarget(null); setDeleteError(null); }}`
- #36 classNames:
  - Modal Close buttons (:197, :233): MUTED_PILL
  - Row Edit (:322) and Show/Hide (:330): `"pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"`
  - Row Delete (:338): DANGER_PILL

### G. #16: log forms

**39. `components/forms/LogWorkoutsForm.tsx`**:
- Imports:
  - :4 becomes `import type { Program } from "@/lib/api/programs";`.
  - Delete :5 (the `fetchProgramWorkouts` import).
  - Add `import { useLogLookups } from "@/lib/hooks/use-log-lookups";` and `import { InlineLoadError } from "@/components/kit/QueryView";`.
- Replace the `members`, `workouts` and `programs` `useState` lines (:120-122) with:
```tsx
  // polish #16: lookups load with an error state + reload on reconnect (lib/hooks/use-log-lookups.ts).
  const lookups = useLogLookups(token, programId, true);
  const { members, workouts, programs } = lookups;
```
- Delete the `lookupsLoaded` state (:124) and the whole `loadLookups` `useEffect` (:143-166).
- Replace :295-296 with:
```tsx
  const noWorkouts = lookups.loaded && workoutOptions.length === 0;
  const noMembers = lookups.loaded && effectiveCanSelectAny && memberOptions.length === 0;
```
- Insert immediately before `{noLookups && (` (:314): `{lookups.error && <InlineLoadError error={lookups.error} onRetry={lookups.reload} />}`.

**40. `components/forms/LogDailyHealthForm.tsx`**:
- :4 becomes `import type { Program } from "@/lib/api/programs";`. Add the same two imports as step 39.
- Replace the `members` + `programs` state (:143-144) with the step 39 comment, then `const lookups = useLogLookups(token, programId, false); const { members, programs } = lookups;`.
- Delete :146 (`lookupsLoaded`) and the effect at :162-180.
- :348 becomes `const noMembers = lookups.loaded && effectiveCanSelectAny && memberOptions.length === 0;`.
- Insert before `{noMembers && (` (:366): `{lookups.error && <InlineLoadError error={lookups.error} onRetry={lookups.reload} />}`.

### H. Summary and Lifestyle

**41. `app/summary/page.tsx`** (#30, #43, objection 1):
- :41 becomes `import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";`.
- After `refreshSummaryQueries` (:368) add:
```tsx

/** polish #30: a read with nothing to show yet ("…", never a fake 0); idle = waiting for the session. */
function stillLoading(query: QueryLike<unknown>): boolean {
  const status = fromQuery(query).status;
  return status === "loading" || status === "idle";
}
```
- ProgramProgressCard call (:235-238): add `loading={stillLoading(analyticsQuery)}`.
- ActivityTimelineCard `dailyAverage` (:241-245) becomes:
```tsx
              dailyAverage={
                activityTimelineQuery.data
                  ? activityTimelineQuery.data.daily_average
                  : stillLoading(activityTimelineQuery)
                    ? undefined
                    : null
              }
```
- StatCard values: replace the trailing `: "—"` of each value with `: stillLoading(<thatQuery>) ? "…" : "—"`.
  - MTD (:273-275): `mtdParticipationQuery`
  - Total Workouts (:288): `totalWorkoutsQuery`
  - Total Duration (:295-297): `totalDurationQuery`
  - Avg Duration (:304): `avgDurationQuery`
- WorkoutTypesCard call (:312) becomes:
  `<WorkoutTypesCard types={topWorkoutTypes} status={workoutTypesQuery.data ? "ready" : stillLoading(workoutTypesQuery) ? "loading" : "failed"} onClick={() => router.push("/summary/workout-types")} />`
- Both log-form Modals (:316 and :335): add the prop `closeOnEscape={false}`, and put this comment above the first:
  `{/* polish #37: Escape must never wipe a half-filled bulk log (the form has many rows); Close/backdrop still close it. */}`
- ProgramProgressCard (:395-396):
  - Signature: `({ summary, loading = false, unavailable = false }: { summary?: AnalyticsSummary; loading?: boolean; unavailable?: boolean })`
  - `const shown = (text: string) => (loading ? "…" : unavailable ? "—" : text);`
- Replace the StatusBadge line (:441) with:
```tsx
        {progress && (
          <StatusBadge variant={programStatusVariant(progress.status ?? "active")}>{progress.status ?? "active"}</StatusBadge>
        )}
```
- AddHealthCard (#43):
  - :484: replace `from-sky-400 via-sky-500 to-blue-600` with `from-sky-700 to-blue-700`.
  - :491: replace `text-white/80` with `text-white`.
- ActivityTimelineCard:
  - Prop type (:534-535): `/** undefined = loading ("…"), null = its read failed ("—"). */ dailyAverage: number | null | undefined;`
  - The render at :554: `{dailyAverage === undefined ? "…" : dailyAverage === null ? "—" : dailyAverage.toFixed(1)}`
- WorkoutTypesCard:
  - Signature (:617): `({ types, status, onClick }: { types: WorkoutType[]; status: "loading" | "failed" | "ready"; onClick: () => void })`
  - Replace exactly :629-631 (`{types.length === 0 ? (`, the `<p …>No workouts logged yet.</p>`, and `) : (`) with:
```tsx
      {status !== "ready" ? (
        <p className="mt-4 text-sm text-rf-text-muted">{status === "loading" ? "Loading…" : "—"}</p>
      ) : types.length === 0 ? (
        <p className="mt-4 text-sm text-rf-text-muted">No workouts logged yet.</p>
      ) : (
```

**42. `app/lifestyle/page.tsx`** (#31, #36, #43):
- Imports:
  - :5 becomes `import { useQuery, useQueryClient } from "@tanstack/react-query";`.
  - Delete `import { Modal } …` (:24).
  - Add:
```tsx
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { MemberPickerModal } from "@/components/MemberPickerModal";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow, type QueryLike } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
```
- After `POPULARITY_METRICS` (:47) add:
```tsx

type CardStatus = "loading" | "failed" | "ready";

/** polish #31: "…" while a card's read is in flight (or waiting for the session), "—" when it failed. */
function cardStatus(query: QueryLike<unknown>): CardStatus {
  if (query.data !== undefined) return "ready";
  return fromQuery(query).status === "failed" ? "failed" : "loading";
}

function missingText(status: CardStatus, loadingText: string): string {
  return status === "failed" ? "—" : loadingText;
}

type AccentTone = { tint: string; text: string };
// polish #43: the bright hue tints the chip; text uses a dark-aware shade (globals.css --rf-accent-*) that passes
// contrast on light cards and keeps the bright hue in dark mode.
const ACCENTS: Record<"amber" | "violet" | "red" | "green" | "teal", AccentTone> = {
  amber: { tint: "#f59e0b", text: "var(--rf-accent-amber)" },
  violet: { tint: "#8b5cf6", text: "var(--rf-accent-violet)" },
  red: { tint: "#ef4444", text: "var(--rf-accent-red)" },
  green: { tint: "#22c55e", text: "var(--rf-accent-green)" },
  teal: { tint: "#14b8a6", text: "var(--rf-accent-teal)" }
};
```
- After the `useAuthGuard()` line (:51) add `const queryClient = useQueryClient(); const online = useOnlineStatus();`.
- Before `membersQuery` (:75) add `const membersKey = ["lifestyle", "members", programId];` and use it as its `queryKey`.
- After `hasMemberContext` (:122) add:
```tsx
  const metricKey = memberIdForMetrics ?? "program";
  const keys = {
    total: ["lifestyle", "workoutTypes", "total", programId, metricKey],
    mostPopular: ["lifestyle", "workoutTypes", "mostPopular", programId, metricKey],
    longest: ["lifestyle", "workoutTypes", "longest", programId, metricKey],
    participation: ["lifestyle", "workoutTypes", "participation", programId],
    popularity: ["lifestyle", "workoutTypes", "popularity", programId, metricKey],
    timeline: ["lifestyle", "healthTimeline", programId, metricKey, "week"],
    steps: ["lifestyle", "steps", programId, metricKey]
  };
```
- The seven `queryKey`s at :125, :131, :137, :143, :149, :155 and :161 become `keys.total`, `keys.mostPopular`, `keys.longest`, `keys.participation`, `keys.popularity`, `keys.timeline` and `keys.steps`. The values are identical to today's.
- After `stepsStatsQuery` (:164) add:
```tsx
  // polish #31: the Summary recipe. One ErrorView + Retry when a read fails with nothing to show, the stale banner
  // when a reload fails over shown data, refetch on reconnect; cards show "…" while loading and "—" on failure.
  const lifestyleQueries = [membersQuery, workoutTypesTotalQuery, workoutTypeMostPopularQuery,
    workoutTypeLongestDurationQuery, workoutTypeHighestParticipationQuery, workoutTypePopularityQuery,
    healthTimelineQuery, stepsStatsQuery];
  const lifestyleKeys = [membersKey, keys.total, keys.mostPopular, keys.longest, keys.participation,
    keys.popularity, keys.timeline, keys.steps]; // same order as lifestyleQueries
  const lifestyleStates = lifestyleQueries.map((query) => fromQuery<unknown>(query));
  const failedState = lifestyleStates.find((state) => state.status === "failed");
  const lifestyleError = failedState?.status === "failed" ? failedState.error : null;
  const lifestyleStale = lifestyleStates.some((state) => state.status === "stale");
  const retryLifestyle = () =>
    lifestyleQueries.forEach((query, index) => {
      if (query.isError || query.failureCount > 0) void retryNow(queryClient, lifestyleKeys[index]);
    });
  useRefetchOnReconnect(lifestyleQueries);
  const totalStatus = cardStatus(workoutTypesTotalQuery);
  const mostPopularStatus = cardStatus(workoutTypeMostPopularQuery);
  const longestStatus = cardStatus(workoutTypeLongestDurationQuery);
  const participationStatus = cardStatus(workoutTypeHighestParticipationQuery);
```
- Header "Manage workouts" button (:187): insert `min-h-[44px]` after `inline-flex`.
- After the `EmptyState` block (:208-210) insert:
```tsx

        {/* polish-1 rule 6: a read that failed while offline shows the kit's offline view. */}
        {lifestyleError && <ErrorView error={online ? lifestyleError : appError("offline")} onRetry={retryLifestyle} />}
```
- The four WorkoutStatCards (:214-283): replace each card's `accent`, `value` and `subtitle` props as follows.
  - Total:
    - `accent={ACCENTS.amber}`
    - `value={workoutTypesTotalQuery.data ? String(workoutTypesTotalQuery.data.total_types) : missingText(totalStatus, "…")}`
    - `subtitle={workoutTypesTotalQuery.data ? "different exercises" : missingText(totalStatus, "Loading")}`
  - Most popular:
    - `accent={ACCENTS.violet}`
    - `value={workoutTypeMostPopularQuery.data ? workoutTypeMostPopularQuery.data.workout_name ?? "N/A" : missingText(mostPopularStatus, "…")}`
    - `subtitle={workoutTypeMostPopularQuery.data ? `${workoutTypeMostPopularQuery.data.sessions} workouts` : missingText(mostPopularStatus, "Loading")}`
  - Longest:
    - `accent={ACCENTS.red}`
    - `value={workoutTypeLongestDurationQuery.data ? workoutTypeLongestDurationQuery.data.workout_name ?? "N/A" : missingText(longestStatus, "…")}`
    - `subtitle={workoutTypeLongestDurationQuery.data ? `${workoutTypeLongestDurationQuery.data.avg_minutes} mins avg` : missingText(longestStatus, "Loading")}`
  - Participation:
    - `accent={ACCENTS.green}`
    - `value={workoutTypeHighestParticipationQuery.data ? workoutTypeHighestParticipationQuery.data.workout_name ?? "N/A" : missingText(participationStatus, "…")}`
    - `subtitle={workoutTypeHighestParticipationQuery.data ? `${workoutTypeHighestParticipationQuery.data.participation_pct.toFixed(1)}% of members` : missingText(participationStatus, "Loading")}`
- Other card calls:
  - :286: `<StepsStatsCard stats={stepsStatsQuery.data} status={cardStatus(stepsStatsQuery)} />`
  - :288-291: `<WorkoutTypePopularityCard types={workoutTypePopularityQuery.data ?? []} status={cardStatus(workoutTypePopularityQuery)} />`
  - Both timeline cards (:293-309): `isLoading={healthTimelineQuery.isLoading}` becomes `status={cardStatus(healthTimelineQuery)}`.
- After the `<MemberPickerModal … />` call (:312-327), which is unchanged and now uses the import, add:
```tsx
      {lifestyleStale && !lifestyleError && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryLifestyle} />
        </>
      )}
```
- WorkoutStatCard (:334-357): type `accent: AccentTone`; the value `<p>` gets `style={{ color: accent.text }}`.
- AccentChip (:359-368): `({ label, accent }: { label: string; accent: AccentTone })` with `style={{ backgroundColor: `${accent.tint}22`, color: accent.text }}`.
- LifestyleTimelineCard and StepsTimelineCard: the prop `isLoading: boolean` becomes `status: CardStatus`. Body:
  - `{status === "loading" && (…existing Loading timeline...…)}`
  - New: `{status === "failed" && (<div className="mt-6 rounded-2xl bg-rf-surface-muted px-4 py-8 text-center text-sm text-rf-text-muted">—</div>)}`
  - `{status === "ready" && trimmed.length === 0 && (…existing No data yet.…)}`
  - `{status === "ready" && trimmed.length > 0 && (…existing chart…)}`
- StepsStatsCard (:436-458):
  - Prop `isLoading: boolean` becomes `status: CardStatus`.
  - Replace `<IconSteps className="h-5 w-5 text-[#14b8a6]" />` (:440) with this mandatory wrap (IconProps has no `style`):
    `<span className="inline-flex" style={{ color: ACCENTS.teal.text }}><IconSteps className="h-5 w-5" /></span>`
  - Chip: `<AccentChip label="Program to date" accent={ACCENTS.teal} />`
  - Both value `<p>`s: `style={{ color: ACCENTS.teal.text }}`.
  - Value texts: `{stats ? stepsLabel(stats.total_steps) : missingText(status, "…")}` and `{stats ? stepsLabel(stats.avg_steps_per_day) : missingText(status, "…")}`.
  - `STEPS_ACCENT` stays, used only for the bar fill (:513).
- WorkoutTypePopularityCard:
  - Prop `isLoading` becomes `status: CardStatus`. Blocks:
    - `{status === "loading" && (…)}`
    - New: `{status === "failed" && <p className="mt-4 text-sm text-rf-text-muted">—</p>}`
    - `{status === "ready" && displayTypes.length === 0 && (…No workouts logged yet.…)}`
    - `{status === "ready" && displayTypes.length > 0 && (…)}`
  - #36: metric segment buttons get `aria-pressed={metric === item.key}` and className `"flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 text-xs font-semibold transition"`.
  - "Show all": `"mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-rf-accent"`.
- Delete the local `function MemberPickerModal(…)` (:618-688).

### I. Programs hub (#22, #36, #37, #38, #41). Shared with N3.

**43. `app/programs/page.tsx`**:
- Imports:
  - :25 becomes `import { formatDateRange, formatInviteDate, initials } from "@/lib/format";`.
  - :32 becomes `import { IconUser, IconLock, IconPalette, IconDocument, IconHelp, IconLogout, SearchIcon } from "@/components/icons";`.
- After `const [showSignOut, setShowSignOut] = useState(false);` (:59) add:
```tsx
  // polish #22: one error banner for card actions (delete program, cancel request), as on iPhone.
  const [actionError, setActionError] = useState<AppError | null>(null);
```
- In `updateMembershipMutation` (:95) and `deleteProgramMutation` (:162), insert before `onSuccess`:
```tsx
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(toAppError(error)),
```
- After `const pendingInvitesCount = …` (:199) add:
```tsx
  // polish #22: which invite button is mid-request ("Accepting…" / "Declining…" / "Revoking…").
  const respondPending =
    respondInviteMutation.isPending && respondInviteMutation.variables
      ? { inviteId: respondInviteMutation.variables.inviteId, action: respondInviteMutation.variables.action }
      : null;
  const accountInitials = initials(session?.user.memberName || session?.user.username || "");
```
- Delete the tab-flip `useEffect` (:201-205).
- `renderAddButton` onClick (:250-253): before `setShowActions(true);` add
  `setActionsTab(pendingInvitesCount > 0 ? "invites" : "create"); // polish #22: pick the tab only on open`
- Replace the stale-banner block (:387-394) with:
```tsx
      {/* Priority: action error > stale; both hidden while the global offline banner shows (A6). */}
      {actionError && online ? (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="error" error={actionError} onDismiss={() => setActionError(null)} />
        </>
      ) : (
        programsState.status === "stale" &&
        online && (
          <>
            <div aria-hidden="true" className="h-36" />
            <FloatingBanner variant="stale" onRetry={() => void programsQuery.refetch()} />
          </>
        )
      )}
```
- Actions Done (:400-405): `<button type="button" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-rf-text-muted" onClick={() => setShowActions(false)}>`.
- InvitesTab call (:424): add `pending={respondPending}`.
- Account Done (:483) className: `"pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"`.
- My Profile AccountRow (:490-498): keep the onClick and set:
  - `title={session?.user.memberName || "My Profile"}`
  - `subtitle={session?.user.username ? `@${session.user.username}` : "Update your personal info"}`
  - `icon={accountInitials ? <span className="text-sm font-semibold">{accountInitials}</span> : <IconUser className="h-5 w-5" />}`
- After the Privacy Policy AccountRow (ends :525) insert:
```tsx
            <AccountRow
              title="Support"
              subtitle="Get help or contact us"
              icon={<IconHelp className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                // polish #41: /support is a public page with no in-app back; open it beside the app, as the phones do.
                window.open("/support", "_blank", "noopener");
              }}
            />
```
- Edit modal `onSave` (:547-553) becomes:
```tsx
            onSave={async (payload) => {
              try {
                await updateProgramMutation.mutateAsync({ programId: editTarget.id, ...payload });
                setEditTarget(null);
              } catch {
                // errorMessage shows in the modal
              }
            }}
```
- Delete-program ConfirmDialog `onConfirm` (:569-572): `onConfirm={() => { if (deleteTarget) deleteProgramMutation.mutate(deleteTarget.id); }}`.
- Decline-modal Decline button (:623-642):
  - Add `disabled={respondInviteMutation.isPending}`.
  - className: `"danger-pill rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"`.
  - Label: `{respondInviteMutation.isPending ? "Declining…" : "Decline"}`.
- Drag handle (:690) className: `"flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-full text-rf-text-muted hover:text-rf-text active:cursor-grabbing"`.
- ProgramCard (#37, objection 2):
  - The `GlassCard` (:734-738) stays exactly as is: mouse `onClick`, no role, no tabIndex.
  - Replace `<h3 className="text-lg font-semibold text-rf-text">{program.name}</h3>` (:741) with:
```tsx
          <h3 className="text-lg font-semibold text-rf-text">
            {/* polish #37: the keyboard / screen-reader way in. A real button (the card's inner Edit / Delete / Cancel
                stay separately reachable); stopPropagation so the card's own click doesn't open it twice. */}
            <button
              type="button"
              disabled={!canOpen}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              className="rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-rf-accent disabled:cursor-default"
            >
              {program.name}
            </button>
          </h3>
```
- Cancel request (:779) className: `"inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text disabled:opacity-60"`.
- Card Edit (:795) and Delete (:805): prepend `inline-flex min-h-[44px] items-center px-1 ` to each className.
- TabButton (:826-837): add `aria-pressed={active}`; className becomes `"flex min-h-[44px] flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition"`.
- InvitesTab: add to the destructure and the props type:
```tsx
  /** The invite button mid-request (polish #22); every invite button is disabled while one runs. */
  pending: { inviteId: string; action: "accept" | "decline" | "revoke" } | null;
```
  On both `<InviteCard …>` usages add `pendingAction={pending && pending.inviteId === invite.invite_id ? pending.action : null}` and `busy={pending !== null}`.
- InviteCard:
  - Add the props `pendingAction: "accept" | "decline" | "revoke" | null; busy: boolean;`.
  - Replace the button row (:982-1003) with:
```tsx
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-4 text-sm font-semibold text-black disabled:opacity-60"
          onClick={onAccept}
        >
          {pendingAction === "accept" ? "Accepting…" : "Accept"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text disabled:opacity-60"
          onClick={onDecline}
        >
          {pendingAction === "decline" ? "Declining…" : "Decline"}
        </button>
        {isAdmin && onRevoke && (
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-full border border-rf-danger px-4 text-sm font-semibold text-rf-danger disabled:opacity-60"
            onClick={onRevoke}
          >
            {pendingAction === "revoke" ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
```
- CreateProgramTab:
  - Replace `const isValid = name.trim().length > 0;` (:1027) with:
```tsx
  // polish #38 (programs D-C3): the Edit rule. Start must be strictly before end (the server enforces it too).
  const datesInvalid = startDate !== "" && endDate !== "" && startDate >= endDate;
  const isValid = name.trim().length > 0 && !datesInvalid;
```
  - #37 labels and inputs: :1032 gets `htmlFor="create-program-name"`, with `id="create-program-name"` on its input. Do the same at :1054 with `create-program-start` and at :1063 with `create-program-end`.
  - After the dates grid's closing `</div>` (:1071) insert `{datesInvalid && <p className="text-xs font-semibold text-rf-danger">End date must be after the start date.</p>}`.
  - Create button className (:1086): append ` disabled:opacity-50`.
- EditProgramModal:
  - After the `endDate` state (:1110) add `const datesInvalid = startDate !== "" && endDate !== "" && startDate >= endDate; // polish #38`.
  - Close (:1116): `<button type="button" onClick={onCancel} className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold">`.
  - Labels at :1123, :1144 and :1153 get `htmlFor` with matching input `id`s `edit-program-name`, `edit-program-start` and `edit-program-end`.
  - Insert the same `datesInvalid` paragraph after its dates grid (:1161).
  - Cancel (:1169) className: `"pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"`.
  - Save (:1175): `disabled={isSaving || datesInvalid}`, className `"inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-5 text-sm font-semibold text-black disabled:opacity-50"`.

### J. Program tab, profile, password

**44. `app/program/page.tsx`** (#33, #41). Shared with N3.
- Imports:
  - :13 becomes `import { appError, toAppError } from "@/lib/kit/app-error";`.
  - Add:
```tsx
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
```
  - Add `IconHelp` to the icons import list (:19-31).
- After `const [showLeaveConfirm, …]` (:45) add `const [showSignOut, setShowSignOut] = useState(false);`.
- Before the two queries add `const membershipKey = ["program", "membership-details", programId];` and `const workoutsKey = ["program", "workouts", programId];`, and use them as their `queryKey`s.
- After `workoutsQuery` (:57) add:
```tsx
  // polish #33 (the Summary recipe): spinner → ErrorView + Retry → honest lines; never "0 active" for a failed read.
  // The workout types only count on the admin view (the member view never shows them).
  const online = useOnlineStatus();
  const membershipState = fromQuery(membershipQuery);
  const workoutsState = fromQuery(workoutsQuery);
  const membersPending = membershipState.status === "loading" || membershipState.status === "idle";
  const membersFailed = membershipState.status === "failed";
  const workoutsPending = workoutsState.status === "loading" || workoutsState.status === "idle";
  const workoutsFailed = workoutsState.status === "failed";
  const loadError =
    membershipState.status === "failed"
      ? membershipState.error
      : isProgramAdmin && workoutsState.status === "failed"
        ? workoutsState.error
        : null;
  const loadStale =
    !loadError && (membershipState.status === "stale" || (isProgramAdmin && workoutsState.status === "stale"));
  const retryLoads = () => {
    if (membershipQuery.isError || membershipQuery.failureCount > 0) void retryNow(queryClient, membershipKey);
    if (workoutsQuery.isError || workoutsQuery.failureCount > 0) void retryNow(queryClient, workoutsKey);
  };
  useRefetchOnReconnect([membershipQuery, workoutsQuery]);
```
- After `{errorMessage && <ErrorState message={errorMessage} />}` (:102) add `{loadError && <ErrorView error={online ? loadError : appError("offline")} onRetry={retryLoads} />}`.
- Honest lines:
  - :155: `{membersPending ? "Loading..." : membersFailed ? "—" : `${activeMembers} active`}`
  - :183: `{membersPending && (`
  - :189: `{!membersPending && !membersFailed && admins.length === 0 && loggers.length === 0 && (`
  - :234-238: `{workoutsPending ? "Loading..." : workoutsFailed ? "—" : customWorkouts.length > 0 ? `${visibleWorkouts.length} available, ${customWorkouts.length} custom` : `${visibleWorkouts.length} types available`}`
  - :298: `value={membersPending || membersFailed ? "—" : `${activeMembers}`}`
- Both `<MyAccountSection onSignOut={signOut} />` (:248, :321) become `<MyAccountSection name={session?.user.memberName ?? ""} username={session?.user.username ?? ""} onSignOut={() => setShowSignOut(true)} />`.
- After the Leave ConfirmDialog (ends :334) insert:
```tsx

      <ConfirmDialog
        open={showSignOut}
        title="Sign Out"
        description="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        danger
        onClose={() => setShowSignOut(false)}
        onConfirm={async () => {
          await signOut();
          router.push("/login");
        }}
      />

      {loadStale && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={retryLoads} />
        </>
      )}
```
- `MyAccountSection` (:446):
  - Signature: `({ name, username, onSignOut }: { name: string; username: string; onSignOut: () => void })`.
  - In the My Profile button (:457-470), replace the icon span and text div with:
```tsx
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-600">
            {initials(name || username) || <IconUser className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate">{name || "My Profile"}</p>
            <p className="truncate text-xs text-rf-text-muted">{username ? `@${username}` : "Update your personal info"}</p>
          </div>
```
  - After the Privacy Policy button (ends :515) insert:
```tsx

        <button
          type="button"
          onClick={() => window.open("/support", "_blank", "noopener")}
          className="flex w-full items-center gap-4 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-left text-sm font-semibold text-rf-text shadow-sm transition hover:border-rf-text"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <IconHelp className="h-5 w-5" />
          </span>
          <div>
            <p>Support</p>
            <p className="text-xs text-rf-text-muted">Get help or contact us</p>
          </div>
          <span className="ml-auto text-rf-text-muted">›</span>
        </button>
```
  - Sign Out button onClick (:519): `onClick={onSignOut}`.

**45. `app/program/profile/page.tsx`** (#15, #18, #37). Shared with People S2.
- Imports: add `import { InlineLoadError } from "@/components/kit/QueryView";` and `import { fromQuery, retryNow } from "@/lib/kit/async-state";`. Add `useRef` to the React import if it is missing.
- After `showDeleteConfirm` (:52) add `const [deleteError, setDeleteError] = useState<string | null>(null);`.
- Insert before the profile-hydrate effect (:136):
```tsx
  // polish #18: the name fields start from the session (never blank while the profile loads or fails); the profile
  // overwrites them when it arrives.
  const seededFromSession = useRef(false);
  useEffect(() => {
    const name = session?.user.memberName;
    if (seededFromSession.current || profileQuery.data || !name) return;
    seededFromSession.current = true;
    const parts = name.split(" ").filter(Boolean);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
  }, [session?.user.memberName, profileQuery.data]);
```
- `deleteMutation.onError` (:207-209) becomes `setDeleteError(toAppError(error).message); // polish #15: right under the button`.
- Replace :223 with:
```tsx
  // polish #18: Save waits for the profile (an unloaded gender would otherwise be saved as cleared).
  const profileLoaded = profileQuery.data !== undefined;
  const canSave =
    profileLoaded && firstName.trim().length > 0 && lastName.trim().length > 0 && !updateMutation.isPending;
```
- Replace :227-229 with:
```tsx
  const identitiesLoaded = identitiesQuery.data !== undefined;
  const identities = identitiesQuery.data?.identities ?? [];
  const hasGoogle = identities.some((i) => i.provider === "google");
  // polish #18: unknown until loaded; never assume "has a password" / "Google not linked" while loading or offline.
  const hasPassword = identitiesQuery.data?.has_password ?? false;
  const profileState = fromQuery(profileQuery);
  const identitiesState = fromQuery(identitiesQuery);
```
- After the avatar block's closing `</div>` (:250) insert:
```tsx

          {profileState.status === "failed" && (
            <InlineLoadError
              error={profileState.error}
              onRetry={() => void retryNow(queryClient, ["account", "profile", session?.user.id])}
            />
          )}
```
- #37 labels: add `htmlFor` plus a matching input `id` at:
  - :254 `profile-first-name`
  - :268 `profile-last-name`
  - :344 `profile-new-email`
  - :361 `profile-email-password`
- After `<p className="text-sm font-semibold text-rf-text">Sign-in methods</p>` (:394) insert:
```tsx
            {identitiesState.status === "failed" && (
              <InlineLoadError
                error={identitiesState.error}
                onRetry={() => void retryNow(queryClient, ["account", "identities", session?.user.id])}
              />
            )}
```
- Sign-in methods lines:
  - :400: `{!identitiesLoaded ? "—" : hasGoogle ? (identities.find((i) => i.provider === "google")?.email ?? "Linked") : "Not linked"}`
  - :415: `disabled={!identitiesLoaded || linkGoogleMutation.isPending}`
  - :424: `{!identitiesLoaded ? "—" : hasPassword ? "Enabled" : "Not set"}`
  - :426: `{identitiesLoaded && !hasPassword && (`
  - :437: `{showPwForm && identitiesLoaded && !hasPassword && (`
- Replace the delete-account block (:479-488) with:
```tsx
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteConfirm(true);
                }}
                className="w-full rounded-2xl border border-rf-danger px-4 py-3 text-sm font-semibold text-rf-danger disabled:opacity-60"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Account"}
              </button>
              <p className="mt-2 text-xs text-rf-text-muted">
                This will permanently delete your account and all associated data.
              </p>
              {deleteError && <p role="alert" className="mt-2 text-sm font-semibold text-rf-danger">{deleteError}</p>}
```
- Delete ConfirmDialog (:498, :500): `confirmLabel="Delete"` and `onConfirm={() => { setDeleteError(null); deleteMutation.mutate(); }}`.

**46. `app/program/password/page.tsx`** (#37):
- :78: `<label htmlFor="password-new" …>`, with `id="password-new"` on the input at :80.
- :101: `<label htmlFor="password-confirm" …>`, with `id="password-confirm"` on the input at :102.

## Steps — ios
None. This track owns no iOS files. Shared rules for the parallel iOS Track P:
- Copy, verbatim:
  - `End date must be after the start date.`
  - `Deleting…`, `Accepting…`, `Declining…`, `Revoking…`
  - Support row: `Support` / `Get help or contact us`
  - Sign-out confirm: `Sign Out` / `Are you sure you want to sign out?`
  - Kit `Couldn't load this` + `Retry`
- #17: a retry after a successful register only signs in, and the earlier steps are locked (no Back).
- #44: send `gender: null` explicitly (`NSNull()`).
- #27: filter by `my_status == "active"`.
- #11: remove the checkbox; `is_active` stays server-accepted.
- #38: the server now also rejects start ≥ end on create.

## Steps — android
None. The same shared rules apply. #44 uses a JsonObject body so the explicit null survives.

## Endgame
47. **Compile-check.**
    - **Backend**, from `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend`. The env values below are dummies, not secrets. Never run `node server.js` (it connects to prod).
```zsh
node -c services/programService.js
SUPABASE_URL=https://example.invalid SUPABASE_SERVICE_ROLE_KEY=x DATABASE_URL=postgres://u:p@127.0.0.1:1/x node -e '
const assert = require("assert");
require("./routes/programs");
const { createProgram } = require("./services/programService");
(async () => {
  for (const [s, e] of [["2026-10-13","2026-10-13"],["2026-10-14","2026-10-13"],["2026-10-14T00:00:00Z","2026-10-13"]]) {
    await assert.rejects(createProgram({ name: "x", start_date: s, end_date: e }, { id: "me" }),
      (err) => err.statusCode === 400 && err.message === "End date must be after the start date.");
  }
  console.log("programs #38 guard OK"); process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });'
```
    - Backend passes when it prints `programs #38 guard OK`.
    - **Web:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build` must be green.
      - Do NOT run `npm run lint`: there is no ESLint config, so `next lint` starts an interactive setup. The `next build` type check is the gate.
      - Afterwards, `rm -rf apps/web/.next` to keep the disk lean.
    - **iOS / Android:** not touched by this track.
    - **Visual and live testing is the USER's, on prod.** Staging isn't needed: no migration, no auth/session change. Check at 375 px and on desktop, in light and dark:
      - **Desktop Summary:** in Log workouts, open a member picker, type in its search, press Escape. The rows must stay. Close/backdrop still close the form.
      - **/programs:** Tab reaches each program name, then Edit / Delete / Cancel request. Enter on a name opens the program. Sheet tabs, Accept shows "Accepting…", Escape closes the sheet, Support opens in a new tab, the profile row shows name and @username.
      - **Program tab:** the Sign Out confirm; Support opens in a new tab.
      - **Profile:** offline load shows "—" and Retry; Delete shows "Deleting…" with the error under it.
      - **Lifestyle:** "—" on failure, accent contrast, picker rows.
      - **Summary:** "…" while loading; health-card contrast.
      - **Detail pages:** Retry, and a detail page comes back by itself on reconnect.
      - **Workout-type delete with logs:** the 400 text shows inside the dialog.
      - **Sign-in pages** in dark mode.
      - **Refresh as a global admin** on /members/history or /program/roles must not bounce.
      - **Create Program** with end ≤ start.
48. **Migration:** none. 011 and 012 stay reserved; 013 is unused.
49. **git-version:**
    - **Commits:**
      - `feat(backend)` (programService.js) deploys FIRST.
      - Then `feat(web)` (the 40 web files) on Vercel. Check `vercel ls`, and fall back to `vercel --prod --yes --scope personal-vinayak`.
      - Both are no-bump commits.
    - **Owned-interface gate (git-version step 4):** POST `/api/programs` now answers 400 instead of 201 when start ≥ end. The orchestrator must get the USER's acknowledgement of propagation to all consumers (web, iOS, Android) before the docs commit and the `feature/programs` tag.
    - **ONE orchestrator docs commit.** D-numbers are assigned in landing order across the parallel P / N / People tracks; confirm each is still free at commit time.
      - **frontend-kit 0.4.0 → 0.5.0:**
        - D-KIT-20: web QueryView + InlineLoadError with reconnect refetch; `reference_impl`.
        - D-KIT-21: web shared-control a11y. Modal = dialog, topmost-only Escape, focus in/restore, `closeOnEscape`. 44 px BackButton / Button sm / PeriodSelector. ConfirmDialog keep-open mode.
      - **programs 0.2.0 → 0.3.0:** D-C3, the create date guard on server and web.
      - **auth 0.14.0 → 0.15.0:** D-C18. The sign-up retry only signs in; Back is hidden after register; later edits to steps 1-2 are deliberately ignored.
      - **program-memberships 0.3.0 → 0.3.1:** D-C6. The checkbox is retired on web and iOS; `is_active` is kept for live binaries.
      - **The programs page SPEC** gets a new D-REL7: delete-program and cancel-request errors show in a dismissable FloatingBanner (iOS parity). It supersedes the :126 sentence "other mutation errors render inside their modal/tab" for those two card actions.
      - **Page SPEC PATCH bumps, no tags:**
        - Sign-in: login, create-account, forgot-password, reset-password
        - programs, program, program/{profile, password, edit, roles}
        - members/{detail, history, streaks, workouts, health, invite, metrics}
        - summary, summary/{log-workout, log-health, activity, distribution, workout-types}
        - lifestyle, lifestyle/{timeline, steps-timeline, workouts}
      - Update registry.json, specs/features/REGISTRY.md and specs/pages/REGISTRY.md.
    - **Tags:** `feature/frontend-kit@v0.5.0`, `feature/programs@v0.3.0`, `feature/auth@v0.15.0`, `feature/program-memberships@v0.3.1`.
    - **No app version bumps.**

## SPEC map (row → page SPECs / feature SPECs)
| Row | Page SPECs | Feature SPECs |
|---|---|---|
| #9 | lifestyle/workouts, members/workouts, members/health | none |
| #11 | members/detail | program-memberships D-C6 |
| #15, #18 | program/profile | none |
| #16 | summary/log-workout, summary/log-health, summary | none |
| #17 | create-account | auth D-C18 |
| #19 | members/{history, streaks, workouts, health, detail, invite}, program/{edit, roles}, summary/{log-workout, log-health} | none |
| #22 | programs (D-REL7) | none |
| #23 | login, create-account, program/profile | none |
| #29 | summary/{activity, distribution, workout-types}, members/{history, streaks, workouts, health, detail, metrics}, program/roles, lifestyle/{timeline, steps-timeline, workouts} | frontend-kit D-KIT-20 |
| #30 | summary | none |
| #31 | lifestyle | none |
| #33 | program | none |
| #36, #37 | programs, program/profile, program/password, lifestyle, lifestyle/workouts, members/workouts, members/health, program/roles, summary (closeOnEscape), plus every page with a PeriodSelector or BackButton | frontend-kit D-KIT-21 |
| #38 | programs | programs D-C3 |
| #39 | members/metrics | none |
| #41 | programs, program | none |
| #43 | login, create-account, forgot-password, reset-password, summary, lifestyle | none |

## Risks the implementer must watch
- **Same-file collisions:**
  - N3 shares programs/page.tsx, program/page.tsx and components/icons/index.tsx. S2 shares program/profile/page.tsx. P-web lands first; N3 and S2 rebase.
  - Do not touch members/page.tsx, members/list, NotificationModal, NotificationsGate, shell.tsx or Select.tsx.
- **Escape behaviour (objection 1):**
  - Escape is ignored when focus is outside the panel, which covers the portaled searchable Select search box.
  - Both bulk-log modals use `closeOnEscape={false}`.
  - Accepted residue: a non-searchable Select dropdown (Status in Create/Edit Program, the members filter/edit modals) keeps focus on its trigger inside the panel. Escape there closes the pop-up, which acts as Cancel, the standard dialog behaviour. Those forms hold one to four fields. A proper fix is Escape handling in `Select.tsx`, outside this brief; recorded as debt.
- **ProgramCard:** the card div must NOT get `role`, `tabIndex` or `onKeyDown`. The name button's `stopPropagation` prevents a double `onSelect`.
- **Query keys:** every hoisted key must be value-identical to today's. The Summary sub-pages share `["summary", …]` keys with the Summary launch cache.
- **No QueryView or FloatingBanner inside a GlassCard** (their banners are `position: fixed`). The Program-tab Sign Out ConfirmDialog sits at page root, not inside `MyAccountSection`.
- **Tailwind:** no `/NN` opacity modifiers on `rf-*` colours (they generate no CSS). Use `danger-pill` and `ring-rf-accent`.
- **Backend:**
  - Equal dates are now rejected on CREATE, matching every edit screen. Old iOS gets the 400 text.
  - No route, field or shape changes. The guard sits BEFORE `sequelize.transaction()`.
  - Don't touch the S0 files.
- **#17:** `registeredAs` holds the password in component memory only; never write it to storage.
- **#19:** gate on exactly `isBootstrapping || !session`.
- **#31:** `membersQuery` is disabled for non-admins (idle), so it never raises the ErrorView. In program/page.tsx, workout-type failures count only on the admin view.
- **Deliberate global visual changes:**
  - `--rf-text-muted` darkens app-wide to `#646a76` (veto = skip step 11a).
  - `.error-banner` text becomes `#dc2626`.
  - Small pills grow to 44 px (`text-xs` → `text-sm`).
  - The members Delete pills gain the `danger-pill` tint and border.
  - The health card gradient darkens to sky-700 → blue-700.
- **Platform divergences:**
  - Web-only by nature: #19, #23, #37 (keyboard, Escape, labels, focus), #39 and the #22 tab-flip fix.
  - Support opens in a new browser tab on web; the phones open the URL externally.
  - #41 already exists on iOS and Android.
- **Debt (recorded, not fixed here):**
  - programs/page.tsx grows to about 1325 lines; lifestyle/page.tsx stays around 760 lines after the picker extraction. Splitting out InviteCard, CreateProgramTab and EditProgramModal, and the lifestyle cards, is outside this brief.
  - `Select.tsx` should own Escape and stop removing `modal-open` while a Modal is open (pre-existing).
- **`next lint` can't run.** Clean up unused imports by hand (LoadingState, ErrorState, toAppError, Modal).
