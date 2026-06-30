# Screen: `program-actions` (ios) — the create-program + invites sheet (the picker "+" target)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** presented as a `.sheet` from `ProgramPickerView`'s floating **"+"** button
> (`ProgramPickerView.swift:148-156`, badge = pending-invite count); `onDismiss` reloads programs +
> pending invites.
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/{ProgramActionsSheet,CreateProgramTabView,InvitesTabView,InviteCardView}.swift`.
> **Web parity reference:** [`web programs`](../../web/programs/SPEC.md) — the create flow (`CreateProgramTab`)
> + the invites flow (`InvitesTab`/`InviteCard`/decline modal) live inline on the web `/programs` hub.
> **Consumes (features):** [`programs`](../../../features/programs/SPEC.md) — `createProgram()`
> (`POST /programs`); [`program-memberships`](../../../features/program-memberships/SPEC.md) —
> `fetchMyInvites`/`fetchAllInvites` (`GET /program-memberships/{my,all}-invites`) +
> `respondToInvite` (`PUT /program-memberships/invite-response`).
> **Stance:** **faithful 1:1** port of the legacy iOS tabbed sheet + its 3 sub-views — both web and legacy
> iOS already agree on the create form + invites flow, so faithful **is** web parity. Oddities flagged §10.

---

## 1. What it is + who uses it

The **Program Actions sheet** — a two-tab modal: **Invites** (accept/decline/revoke pending program
invitations) and **Create** (create a new fitness program). It opens from the program picker's floating
"+" and auto-selects the Invites tab when invites are pending, else the Create tab. Used by **every
authenticated role**: anyone can create a program (becomes its admin); the Invites tab is role-bifurcated
(global_admin sees **all** system invites grouped by program; everyone else sees their own).

## 2. Why it exists

To give the picker its two write actions natively — program creation and invite triage — matching the
built web `/programs` hub, where both live as the **Create** + **Invites** tabs of the actions modal. The
iOS picker (run 52) already handles inline card-level invite Accept/Decline; this sheet adds the **full**
invites surface (grouping, admin revoke, the block-future-on-decline modal) + the create form.

## 3. Route / location

- **App:** `ios`. **Presented as:** a `.sheet` from `ProgramPickerView` (the "+" button).
- **Contains:** a segmented `Picker` → a paged `TabView` of `InvitesTabView` (tag 0) + `CreateProgramTabView`
  (tag 1); a "Done" toolbar button. **Dismisses to:** the picker; `onDismiss` reloads programs +
  `loadPendingInvites()`. No forward-nav (the decline confirm is an in-sheet overlay).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Tab picker | Segmented `Picker` — "All Invites"/"My Invites" (by `isGlobalAdmin`) + "Create". Auto-selects tab 0 if `pendingInvites` non-empty, else tab 1. | legacy `ProgramActionsSheet.swift:26-35,68-74` |
| Sheet chrome | `NavigationStack` + `AppGradient.sheetBackground` + inline "Done" button. | legacy `:53-66` |
| **Create tab** | Header + **Program name** `TextField` + **Status** `Menu` (`planned`/`active`/`completed`, default `planned`) + **Start date** (today) + **End date** (today+3mo) `DatePicker`s + a "Create Program" button (disabled until name non-empty); success `Alert`. | legacy `CreateProgramTabView.swift:29-157` |
| **Invites tab** | Header + loading/empty/list states. **Standard:** flat list of `InviteCard`s. **Admin:** invites grouped by program name (sorted), each card showing "To: @username". | legacy `InvitesTabView.swift:29-177` |
| `InviteCard` | Program name (non-admin) + `StatusPill` + (admin) invitee + date range + "Invited by"/date + **Accept**/**Decline**/(admin) **Revoke** buttons. | legacy `InviteCardView.swift:55-153` |
| `DeclineInviteDialog` | In-sheet overlay: "Decline invitation?" + program name + a **"Block future invites"** checkbox + Decline/Cancel. | legacy `InvitesTabView.swift:211-321` |

**Create flow** (`CreateProgramTabView.save()`): `createProgram(name, status, startDate, endDate)` →
`POST /programs` → refresh programs → success `Alert` → `onCreated()` dismisses. **Invite flow**
(`InvitesTabView.respondToInvite`): `respondToInvite(inviteId, action, blockFuture)` →
`PUT /program-memberships/invite-response` → `loadPendingInvites()` (+ `loadLookupData()` on accept); an
**accept** also fires `onAccepted()` → dismiss. Decline routes through the block-future dialog.

## 5. Components + features consumed

- **Components:** `StatusPill` (top-level in `ProgramPickerView.swift:775`, **reused** — not redefined),
  `AppGradient.sheetBackground`, `Color.appOrange`/`appRed`/`appGreen`/`appBlue`/`appBackgroundSecondary`,
  native `Picker`/`TabView`/`Menu`/`DatePicker`/`Alert`. **No new component.**
- **Features:** [`programs`](../../../features/programs/SPEC.md) — `ProgramContext.createProgram()`;
  [`program-memberships`](../../../features/program-memberships/SPEC.md) —
  `ProgramContext.loadPendingInvites()`/`respondToInvite()` over `APIClient+Invites` (`fetchMyInvites`/
  `fetchAllInvites`/`respondToInvite`). All ported in the foundation (run 50).

## 6. Data / API

- **`POST /programs`** (via `createProgram`) — body `{ name, status, start_date?, end_date? }`; creator
  auto-enrolled as admin/active. Returns the new program; the context then re-fetches `GET /programs`.
- **`GET /program-memberships/my-invites`** (standard) / **`/all-invites`** (global_admin) — the pending
  invite list (`PendingInviteDTO`).
- **`PUT /program-memberships/invite-response`** (via `respondToInvite`) — body
  `{ invite_id, action: "accept"|"decline"|"revoke", block_future? }`. Accept also refreshes lookup data.

## 7. Role-based view rules

| Viewer | Invites tab | Create tab |
|--------|-------------|------------|
| global_admin | "All Invites" — every system invite grouped by program; Accept/Decline/**Revoke**. | Create a program (becomes its admin). |
| program admin · logger · member | "My Invites" — own pending invites, flat; Accept/Decline (decline can block future). **No revoke.** | Same — create a program. |

Role bifurcation is `programContext.isGlobalAdmin` (tab label + grouped-vs-flat list + revoke button). Any
authenticated user may create a program (no create-side role gate — matches web).
**`admin_only_data_entry` = N/A** — this sheet creates programs + triages invites; it neither logs nor
gates on the data-entry lock (the lock follows *logging*, deep in the tab bodies).

## 8. States & edge cases

- **Tab auto-select:** invites pending → Invites tab; none → Create tab (`onAppear`).
- **Create:** button disabled until the trimmed name is non-empty; `isSaving` swaps a `ProgressView`;
  errors render an `appRed` footnote; success `Alert` → dismiss.
- **Invites loading/empty:** centered `ProgressView` while loading; an "envelope.open" empty card with
  role-specific copy when `pendingInvites` is empty.
- **Invite error:** caught into `errorMessage` and surfaced via an `.alert` **only on the admin list**
  (legacy quirk — F2); the standard list's `errorMessage` is set but not rendered.
- **Decline:** opens `DeclineInviteDialog`; the block-future checkbox passes `block_future:true`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/{ProgramActionsSheet,CreateProgramTabView,InvitesTabView,InviteCardView}.swift`; web parity = [`web programs`](../../web/programs/SPEC.md) (the Create + Invites tabs of the actions modal). `consumed_by=[ios]`.** | legacy files; web programs SPEC. |
| **D-SCOPE** | **The cluster IS the run** — port the sheet + its 3 sub-views (`CreateProgramTabView`, `InvitesTabView`+`DeclineInviteDialog`, `InviteCard`) together with [`edit-program`](../edit-program/SPEC.md), the picker's two deferred forward-nav targets (run-58 cohesive-cluster precedent). Both stubs removed. | run-58; ProgramPickerView call sites. |
| **D-S1** | **Stance = faithful 1:1** — both web AND legacy iOS agree on the create form + the invites flow (Accept/Decline/Revoke + block-future-on-decline), so faithful **is** web parity (the run-55/56 both-agree shape). No web-parity ADD on this sheet (the ADD is on `edit-program`). | user answer; web programs SPEC §7. |
| **D-DEPS** | **No new dependency** — every service/DTO/component was ported in the foundation (run 50); `StatusPill` is reused from `ProgramPickerView` (top-level, run 52), not redefined. | foundation inventory; collision grep. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Picker already handles inline card-level invite Accept/Decline** (run 52); this sheet duplicates the invite mechanism with the fuller grouped/admin/decline-modal surface. Two invite entry paths coexist (mirrors web's card + modal duality). | `ProgramPickerView.swift:60-66` vs this sheet | Kept (faithful) — mirrors web programs F (dual invite mechanisms). |
| **F2** | **Invite `errorMessage` surfaces only on the admin list** — the `.alert` is attached to `adminInvitesList`; the standard list sets `errorMessage` but never renders it (a swallow). | `InvitesTabView.swift:172-177` | Kept (faithful) — a shared error surface is a rebuild cleanup. |
| **F3** | **`StatusPill` lives top-level in `ProgramPickerView.swift`** (not in `Shared/Components/`); reused here rather than moved. | `ProgramPickerView.swift:775` | Kept — hoisting to `Shared/Components/` is a low-risk cleanup. |
| **F4** | **Role bifurcation is client-side** (`isGlobalAdmin` drives tab label + grouped list + revoke); the backend re-authorizes every invite/create call. | `InvitesTabView.swift` / `InviteCardView.swift` | Kept (faithful) — display-only. |
| **F5** | **Create defaults status `planned` + start=today / end=today+3mo** (web parity); no create-side date-range validation (web validates only on edit). | `CreateProgramTabView.swift:12-14` | Kept (faithful) — matches web create. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 59) — the **create-program + invites sheet** (the picker "+" target), ported into `apps/ios/.../Features/Home/ProgramActions/{ProgramActionsSheet,CreateProgramTabView,InvitesTabView,InviteCardView}.swift`; the deferred stub removed. **D-REF** (legacy iOS + web `programs` parity; `consumed_by=[ios]`) · **D-SCOPE** (the cluster IS the run, ported with `edit-program`) · **D-S1** (faithful 1:1 — both web + legacy iOS agree → faithful is web parity, NO ADD) · **D-DEPS** (no new dependency; `StatusPill` reused from ProgramPickerView). Flagged F1–F5 (dual invite entry paths; admin-only error surface; top-level `StatusPill`; client role gating; create defaults + no create date validation). Role rules = `isGlobalAdmin` bifurcation (all-vs-my invites, grouped + revoke); `admin_only_data_entry` N/A. Build green-check owned by the user (Xcode); symbols grep-verified (each type defined once). |
