# PLAN VERDICT — OBJECTIONS (7)

All 7 are ADVISORY. I found no blocking issue.

1. **[ADVISORY] The toast can still appear over an open sheet.** Revision 2's fix #4 (W14) and the E3 check "never over an open sheet" don't hold, because `body.modal-open` is not a reliable "a modal is open" signal.
   - Evidence: `components/ui/Modal.tsx:15-24`, `components/Select.tsx:114-124` and `components/SelectMobile.tsx:34-43` each run `classList.remove("modal-open")` on close, even when an outer Modal is still open. In `app/programs/page.tsx`, the Decline modal (:587-645) stacks on top of the "+" sheet (:406-470). The sheet's Create tab and `EditProgramModal` also contain a `Select`.
   - Failure scenario: open "+" → Inbox tab → Decline an invite → confirm. The Decline modal closes and removes the class while the sheet stays open. The next stream item then shows a toast at z-40, outside `<main>`, on top of the sheet's header.
   - Fix: detect open modals by what is in the page instead of by the class. For example, watch the body subtree with a MutationObserver and check for `.modal-surface` elements. Modal.tsx is out of scope, so the fix belongs in the toast file.

2. **[ADVISORY] No rollback order between web Pass A and the notifications server.** The notifications server plan's D4 names a deploy revert as its emergency stop. Pass A has no fallback for that.
   - After a backend revert: `/inbox`, `/inbox/unread-count`, `/preferences` and `/announcements` return 404. Nothing on web reads `/unacknowledged` any more (A2/A8), and `?inbox=1` frames arrive without `category`, `target` or `read_at`.
   - Failure scenario: web users stop seeing notifications entirely, and a toast's "View" opens an inbox that shows "We couldn't find that".
   - Fix: add one Risks/Endgame line: if the notifications server is reverted, roll the web back on Vercel first or at the same time.

3. **[ADVISORY] The shared contract and A8 disagree on catch-up.**
   - The table says that on every (re)start and every `ready` the client refreshes the unread count, inbox, active program and invites.
   - A8's `onStart: catchUp` only refreshes programs, invites and the active program; `refreshInbox()` runs only on `ready`.
   - Failure scenario: while the stream can't open (5xx or a deploy), the badge stays stale except for TanStack's refetch on window focus. N4/N5 will build to the table, so web diverges.
   - Fix: call `refreshInbox()` in `onStart`, or correct the table before it is copied into N4/N5.

4. **[ADVISORY] W13 removes today's reactive tab choice.** `app/programs/page.tsx:199-205` currently switches the sheet to Invites when invites finish loading after it opened. The new `openActions()` picks once from `badge`, and before the unread count loads that is the fallback (a member's invite count, often still 0; always 0 for a global admin).
   - Failure scenario: cold load → quick "+" tap → the sheet opens on Create even though invites are pending.
   - Fix: if `unreadQuery.isPending` when the sheet opens, choose the tab once when the count resolves, unless the user has already switched tabs.

5. **[ADVISORY] Version predictions and docs.**
   - invites is predicted as a PATCH, but the change documents new behavior: the global-admin badge rule (W4), C7.7 mark-read after accept/decline, and the Inbox tab. Per `.claude/skills/git-version/SKILL.md:47` that is a **MINOR**.
   - notifications "v0.7.0 shared with N4/N5" can't be shared if Pass A's docs commit lands before the store release that carries N4/N5. Say that N4/N5 take their own bump.
   - The docs supersede D-C18's web clause and F7/F8, but not **D-C17**'s web clause ("`/unacknowledged` on every start + `ready`", notifications SPEC :20, :438). D-C17 is also invalidated by A8.

6. **[ADVISORY] Wrong copy when the composer hits its rate limit.** `lib/kit/app-error.ts` `kindForStatus` maps 429 to `unavailable`, which reads "RaSi Fiters is busy right now. Try again in a moment."
   - Failure scenario: an admin who hits the 10-per-hour send limit (or 30 previews a minute) is told to retry "in a moment", which won't work for up to an hour.
   - KudosButton already special-cases 429 (B6). ComposerForm's send and preview should do the same, using `retryAfter`.

7. **[ADVISORY] S5 can show a false error to plain members.** B10(c) includes `membersQuery` in `dashboardQueries`. That query feeds only the "View as" pickers, which plain members never see.
   - Failure scenario: for a plain member, a failure of a query that nothing on screen uses puts a page-level "Couldn't load this" above fully loaded cards.
   - Fix: include `membersQuery` only when `canViewAs || canViewAsLogger`.
   - Related efficiency point: `refreshQueriesFor` (A8) refetches programs, membership details, the members list, workouts and the metrics preview for **every** item, including reminders, digests, kudos and announcements. An "everyone" announcement makes every open web client refetch about 5 queries. Limit the general refetches to `program.*` types.

**What I checked:**
- Every quoted anchor against HEAD in `client.ts`, `programs/page.tsx`, `program/page.tsx`, `members/page.tsx`, `members/list/page.tsx`, `program/profile/page.tsx` and both privacy pages. All match, and the B5/B10/B11/B12 targets are unique.
- Consumers: the deleted `NotificationModal`, `NotificationItem`, `fetchUnacknowledgedNotifications` and `acknowledgeNotification` are imported only by the gate. The `AccountRow` and `updateMemberProfile` changes are additive.
- That every kit, UI and icon export the plan uses exists, plus Tailwind tokens, StatusBadge variants, ConfirmDialog props, `@types/react` 19 / TS strict compatibility, and TanStack v5 infinite-query typing.
- The CORS setup reflects `X-Time-Zone` (`server.js:55-69`), and the request log doesn't record it.
- The web contract against the notifications server (C1–C7) and People §B–§F. `GET /members` returns `member_name` (a VIRTUAL attribute) and `status`.
- The middleware matcher covers the new routes.
- The mobile apps link to the web `/privacy-policy`, so B12 is the policy for all surfaces.
- Page and feature SPEC base versions and the page-registry inventory count of 37.
- Live-binary compatibility: there is no backend change in this track.
- DECISIONS D-N1–D-N17 and D-P1–D-P11, frontend-kit §5/§6/§10, and amendments A4/A10/A13.
