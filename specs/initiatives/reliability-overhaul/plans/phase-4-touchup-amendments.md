# Phase 4 touch-ups: binding amendments (APPROVED by the user, 2026-10-13)

Plans: `phase-4-touchup-inbox/plan.md` (rev 2) and `phase-4-touchup-profile/plan.md` (rev 2). Both verdicts are
ADVISORY only.

## User decisions
- **Inbox: option (A).**
  - The Invitations section (`program_invites`, Accept/Decline) is never touched.
  - Every Notifications row is removable or clearable, including `program.invite_received`.
  - Ignore the "(B) delta".
- **Profile circle:** as planned (D-PC1). The picker's account menu is unchanged.
- **SEO** (orchestrator, web, already done or doing): WebSite `alternateName`, the description, the per-page
  titles, and the hero eyebrow "RaSi Fiters · For your whole group".

## Advisory fixes (binding)
**Inbox**
1. **Android:** `SwipeToRemove` also resets its `SwipeToDismissBoxState` when the item is still in the list after
   the launched remove finishes. This covers a server refusal that lands before recomposition, so no row is left
   swiped away.
2. **Android docs:** rule 11 / D-NP4 say plainly that "a quick short flick also removes", because M3's fling
   threshold is fixed. Add "a quick short flick" to the device checklist.
3. **Web:** `useRemoveInboxItem` gets
   `onSettled: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.inbox })`. Make sure
   InboxList's mark-all-read effect can't run on a stale cached page because a refetch was cancelled.
4. **iOS checklist:** add "right swipe from the middle of a card, on both pushed hosts (program shell + account
   row)".
5. **notifications SPEC wording:** "…(0.6.0, items 6–8) and two more on the inbox router (0.7.0, item 6):".

**Profile**

6. **Web gate:** `npm run build` only, with no `npm run lint`.
7. **Web profile SPEC §4 Header row:** "Back (`router.back()`) → the opener; `backHref` = no-history fallback",
   anchor `profile/page.tsx` (`PageHeader`).

## Process (orchestrator)
- One implementer per surface (backend, web, iOS, Android). Each carries BOTH plans' steps for its surface, plus
  that surface's page-SPEC doc steps.
- The backend implementer also does the notifications feature-SPEC prose.
- The orchestrator owns `registry.json`, `REGISTRY.md` files, the tags, HANDOFF, RELEASES, all git and every
  deploy.
- No implementer runs git writes or deploys.
- Already in the tree and owned by the orchestrator, so don't touch them:
  - the SEO files (`apps/web/src/app/layout.tsx`, the six route `layout.tsx` files, `components/landing/content.ts`);
  - `EdgeSwipeToReturn.swift` (touch-up d, the swipe commit threshold);
  - `HANDOFF.md` and `plans/*`.
- Commit order:
  1. (d) iOS swipe;
  2. backend → push → live check;
  3. web (inbox + profile + SEO) → push → Vercel;
  4. iOS;
  5. Android;
  6. docs.
