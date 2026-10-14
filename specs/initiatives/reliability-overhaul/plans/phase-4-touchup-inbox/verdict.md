# PLAN VERDICT — OBJECTIONS (6, all ADVISORY; none blocking)

1. **[ADVISORY] Android swipe protection is weaker than the plan says, and nothing can bring an item back.** Material3 1.3.x (BOM 2025.04.01) has a fixed 125 dp/s fling threshold in `SwipeToDismissBoxState`. Any quick sideways flick past touch slop removes the item, whatever the 40 % `positionalThreshold` is. Remove-one has no confirm and no undo, and it is a hard delete on every device.
   - Evidence: step 17(h) KDoc says "a sloppy diagonal scroll in the sheet must not delete". Rule 11 and the D-NP4 text lean on the "40 % threshold".
   - Failure scenario: the user brushes a card sideways for about 1 cm while reaching for "Load more". The fling clears 125 dp/s, the item is gone server-side, and there is no way to get it back.
   - Fix: say it accurately in rule 11 / D-NP4 ("a short flick also removes"). Add "a quick short flick" to the Android device checklist so the user judges it tonight.

2. **[ADVISORY] An Android row can stay swiped away after a refused remove.** `SwipeToRemove` only calls `state.reset()` when `onRemove()` returns false, which is the offline pre-check. When the server refuses, `NotificationInbox.remove` puts the item back under the same `key(item.id)`.
   - If the failure lands before the next recomposition, the composable never left composition. The `SwipeToDismissBoxState` stays at `EndToStart` and `LaunchedEffect(state.currentValue)` does not run again.
   - Evidence: steps 16(d) and 17(f)/(h); `collectAsStateWithLifecycle` merges back-to-back StateFlow emissions.
   - Failure scenario: the "online" flag lags behind a dead link and DNS fails at once (under 16 ms). The row is left showing the red Remove background with no content, and the error line shows.
   - Rare. A cheap fix is to also reset when the item is still present after the launched remove completes.

3. **[ADVISORY] A removed row can come back because of a load that starts after the edit.** The plan's guards (iOS `generation`, Android `listEdits`, web `cancelQueries`) only drop loads that started BEFORE the edit. A load that starts while the DELETE is still in flight can still return the row.
   - Examples of such loads: web SSE `ready` or window-focus invalidation; iOS pull-to-refresh or `refreshHead` from the catch-up; Android `onPushReceived` → `loadAndMarkRead`. The row stays until the next load; removing it again gets a 404, which counts as removed.
   - On web there is a second effect. If the visit's first fresh refetch is in flight (cached pages on screen) and the user clicks × quickly, `editInbox`'s `cancelQueries` cancels that refetch. `isFetching` drops, so InboxList's mark-all effect (InboxList.tsx:69-83) runs on the stale cached page. It sends `markRead("all")`, marking items read that this visit never showed, and they stay hidden until the next invalidation.
   - Fix (one line, standard TanStack): add `onSettled: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.inbox })` to `useRemoveInboxItem`. Accept the phone cases.

4. **[ADVISORY] The iOS back-swipe device check misses the other pushed host.** The checklist only covers a screen-edge pan in the program shell (ProgramCards.swift:319). The Inbox is also pushed from the account row with the native back (ProgramPickerView.swift:133). Every card is now a horizontal ScrollView that rubber-bands on a right swipe.
   - Failure scenario: on an iPhone with iOS 26's full-width "swipe back from anywhere", a right swipe that starts on a card may rubber-band the card instead of going back, while the same swipe on the heading still goes back.
   - Fix: add "right swipe from the middle of a card, on both pushed hosts" to the iOS device checklist.
   - Paging to Create in the "+" sheet is not a concern: the left swipe on a card is blocked by design, and the segmented Picker remains (ProgramActionsSheet.swift:33-41).

5. **[ADVISORY] The 1.5.2 (60) build would ship code that isn't committed.** Step 24 says the iOS 1.5.2 (60) build "also carries the uncommitted (d) `EdgeSwipeToReturn.swift`", and step 25 never stages it.
   - Failure scenario: the App Store candidate contains code that is in no commit. If it's later reverted or lost, there is no record of what shipped (HANDOFF says (d) ships in 60).
   - Fix: commit (d) on its own, through git-version, before the user archives. This plan doesn't need to own it, but it should say so.

6. **[ADVISORY] SPEC doc anchor in step 18.** Line 32 is one complete sentence ending "...nine net-new routes on three sub-routers (0.6.0, items 6–8):". Appending " — 0.7.0 adds two more…" after the colon reads broken, and "nine" stays stale.
   - Fix: change it to "…(0.6.0, items 6–8) and two more on the inbox router (0.7.0, item 6):".

**What I checked, and found sound:**
- **Backend:**
  - The route order puts `/all` before `/:id`. Mount order is server.js:114 before :117, and the legacy router has no `DELETE /inbox*`.
  - CORS allows DELETE by default, and web already has DELETE precedents (people.ts:79).
  - The `rateLimit` `keyFn` runs after `router.use(authenticateToken)`.
  - `NotificationRecipient` has a composite primary key, and `destroy` returns a count.
  - No foreign key or trigger references `notification_recipients`: `push_deliveries` cascades from notifications/members, and `kudos.notification_id` points at notifications (sql/010, sql/012).
  - The other readers of recipient rows (kudos undo, `/unacknowledged`, `/:id/acknowledge`, which already returns 404) degrade safely for iOS 1.4.2/1.5.x and Android 1.0–1.2.0 (6). No live binary calls the new routes.
- **Line anchors:** every one I checked is accurate. That covers backend steps 2–3, web 4–5, iOS 8, 9, 10 (96–166) and 13 (33 / 118–150 / 213), Android 14 (291), 15 (32 / 40), 16 and 17, and the SPEC/REGISTRY lines.
- **Compile-level, iOS:**
  - The project defaults to MainActor isolation with `InferIsolatedConformances`, so the `nonisolated` behavior struct is required. `nonisolated enum` precedents exist.
  - The `LoadState` case shapes, `AppError(kind:)`, `labeled(online:)` and `.appRed` all match.
  - Deployment target 18.6 covers `containerRelativeFrame` and `ScrollTargetBehavior`.
  - Synchronized groups mean no pbxproj edit.
  - There is precedent for a horizontal ScrollView inside a `.refreshable` screen (SummaryChartCards).
- **Compile-level, Android and web:**
  - Android: `AppErrorException` → `toAppError` round-trips; `AppRed` exists; material-icons-extended is present; `FormErrorText(String)` matches.
  - Web: `apiRequest` handles DELETE; `toAppError` maps 404 to `notFound`; mutations use `networkMode: "always"`.
  - Web: the nested `ConfirmDialog` inside the "+" `Modal` works, since no ancestor has a transform/filter and only the topmost dialog handles Escape.
- **Consumers grepped on all surfaces:**
  - `InboxList` has one web host; `inboxTimeLabel` has no other importers.
  - `InboxRow` / `InboxFeed` are used only in `InboxView`; Android `InboxRow` is private.
  - Neither Android host uses a pager.
- **Deploy:** Render `buildFilter` + `autoDeployTrigger: commit`; Vercel's ignore step now diffs against `VERCEL_GIT_PREVIOUS_SHA`; the repo-root `.vercel` link makes the clean-worktree fallback valid.
- **Option (A) vs (B):** the default (A) differs from the brief's assumption (B) and from the task's literal "non-invite item" wording. The plan correctly makes it a USER DECISION, so the approval prompt must show it.

Key files:
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/inbox/InboxList.kt
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/core/NotificationInbox.kt
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/notifications/queries.ts
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/notifications/InboxList.tsx
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/ProgramPickerView.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Components/EdgeSwipeToReturn.swift
- /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md