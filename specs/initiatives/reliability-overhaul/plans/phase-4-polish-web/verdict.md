# PLAN VERDICT — OBJECTIONS (5)

None of the objections block the plan. Number 1 should be fixed before implementation because the plan's own risk notes rely on a mechanism that does not work.

1. **[ADVISORY] Escape still closes the pop-up from a portaled Select search box. The "focus outside the panel" guard in Modal (step 4) never fires for text inputs.**
   - Evidence: `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/hooks/use-dismiss-keyboard.ts:30-36` adds a `keydown` listener on `document` with `capture: true`. It is mounted app-wide at `app/shell.tsx:14`, and it calls `.blur()` on the focused input when Escape is pressed. Capture listeners on `document` run before Modal's bubble listener on `document`.
   - So by the time Modal reads `document.activeElement`, it is `document.body`. The guard explicitly treats `body` as allowed, so the pop-up closes.
   - The plan's claim that the Select "owns its Escape" is also wrong: `components/Select.tsx` has no Escape handling at all.
   - Failure scenario: on `/members/workouts`, open Filter, open "Workout type" (searchable, `members/workouts/page.tsx:330`, portaled at `Select.tsx:232`), type "run", press Escape. The whole Filter pop-up closes, along with the dropdown.
     - No data is lost today, because the filters are live page state.
     - The desktop bulk-log forms are protected only by `closeOnEscape={false}`. The endgame check "type in its search, press Escape, the rows must stay" passes for that reason, not because of the guard.
   - Fix (one line): decide on `event.target`, which is fixed when the event is dispatched, before the blur, instead of on `activeElement`:
     ```tsx
     const t = event.target;
     if (t instanceof Node && t !== document.body && !panelRef.current?.contains(t)) return;
     ```
     Also skip `event.isComposing`, so cancelling Japanese/Chinese IME input doesn't close the pop-up.
   - Related: `aria-modal="true"` is set but nothing keeps Tab inside the panel. Tab can move focus to the page behind, and after that Escape is ignored by the same guard. Either add a Tab wrap in the same listener or record it as accepted debt.

2. **[ADVISORY] #17 only covers "register answered OK, then sign-in failed". It misses "register succeeded on the server but the reply never arrived".**
   - Evidence: in step 15, `registered` becomes true only after `registerAccount` resolves. A 15 s timeout or dropped connection on a register that did commit leaves `registeredAs === null`.
   - On retry, the server returns 400 "Username already exists" (`authService.js:187`). `isTakenError` then sends the user to step 2, telling them their own new username is taken.
   - Failure scenario: a flaky phone connection, the sign-up commits, the reply is lost, the user taps Create again and is told "Username already exists" for an account they just made.
   - Cheap fix: if the previous attempt failed with no HTTP answer (`!(err instanceof ApiError)`), then on an "already exists" reply try `login(username, password)` once before showing the taken message. Otherwise, record this case as out of scope in auth D-C18.

3. **[ADVISORY] #36 leaves the web password "Show/Hide" toggles small.**
   - DISCOVERY #36 lists "the password eye" in what's wrong. The web toggles are bare `text-xs` buttons about 16 px tall with no minimum size:
     - `login/page.tsx:186-191`
     - `create-account/page.tsx:393`, `:411`
     - `program/password/page.tsx:90-95`
     - `reset-password/page.tsx:169`
   - The web evidence in §6 doesn't cite them, so this is optional. If they are not fixed, say so in the #36 page-SPEC notes; three of these files are already being edited.

4. **[ADVISORY] Stale anchor.** Step 21 says the destructure in `members/invite/page.tsx` is at ":13"; it is at `:12`. The effect at `:20-24` is correct. Anchor on the text.

5. **[ADVISORY] Process: the darker `--rf-text-muted` is the user's call.** The brief left the global `--rf-text-muted` change (#7c828e → #646a76, step 11a) to the user. The plan decides YES itself, so the orchestrator has to put that veto point to the user explicitly when asking for approval. It should not be folded into a blanket approval.

**What I checked and found no further problems with:**
- **Backend #38:**
  - Applied the guard to a scratch copy of `apps/backend` and ran the plan's exact test with the dummy env; it printed `programs #38 guard OK`. The guard sits before `sequelize.transaction()`.
  - iOS 1.4.2 (commit f6ac575) shows the server's `error` text for a 400, so old iPhones get a readable message.
  - Android create has blocked start ≥ end since e8cfd61, so 1.0.0 (4) and 1.1.0 (5) never send it.
  - iOS create defaults the end date to +3 months, so normal use won't hit the new 400.
- **Backend verdicts for the other rows:**
  - `membershipService.js:229-231`: `is_active` is optional, and the PUT without it only updates `joined_at`.
  - `memberService.js:139`: an explicit `gender: null` clears it.
  - `healthSyncService.js:155`: answers `skipped_not_member`.
  - `workoutService.js:211-216`: the 400 delete text exists.
  - `logService.js:462/502`: the 404 text exists.
  - After S0, `getMembershipDetails` returns `[]` rather than a 403, so the Program tab's new error view won't fire for plain members.
- **Consumers of shared pieces:**
  - BackButton is used only by PageHeader.
  - Button `sm` is used only by the two log forms.
  - The new ConfirmDialog and Modal props are optional, so existing callers are unchanged.
  - Every `<Modal` user (lifestyle, lifestyle/workouts, programs, members, members/metrics, members/workouts, members/health, summary, ConfirmDialog) is covered by the topmost-only Escape handling.
- **Anchors:** every line anchor in steps 1–46 matches the current files, except item 4 above.
- **Type-level fit:**
  - `fromQuery`, `retryNow`, `QueryLike`, `useRefetchOnReconnect`, `subscribeReconnect`, `appError`, `KIT_COPY.errorViewTitle` and `ApiError` all exist with the signatures used.
  - The plan's hoisted query keys equal today's keys.
  - React is 18.2, so `useId` is available.
  - `tsconfig` has no `noUnusedLocals`, so a missed unused import won't break the build.
  - There is no ESLint config, so the plan is right not to run `next lint`.
  - Tailwind opacity modifiers on `var()` colours generate no CSS, as the plan says.
- **iOS #41 parity:** checked against `ProgramPickerView.swift:610-618` and `:682-692`.
- **Page SPEC:** `specs/pages/web/programs/SPEC.md:57` already says "Opens to invites if any pending", which matches choosing the tab on open.
- **Version numbers:** registry versions (auth 0.14.0, programs 0.2.0, program-memberships 0.3.0, frontend-kit 0.4.0) match the predicted bumps, and D-C18, D-C6, D-C3 and D-KIT-20/21 are all unused.
- **Scope:** no iOS or Android file is touched, and no S0 file is edited.
- **Test safety:** the backend test is safe because `apps/backend/.env.local` is absent. `config/database.js:3` would load that file with `override:true` and replace the dummy `DATABASE_URL` if it ever existed.
