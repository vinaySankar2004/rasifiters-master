# Screen: `program-role-management` (ios) — the Program tab's Role Management section

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** `AdminProgramTab.swift:34` (`ProgramRoleManagementSection()`, gated
> `if programContext.canEditProgramData`). The section shows read-only Admins/Loggers lists + a **Manage
> Roles** nav row → `ManageRolesView` (the per-member role picker).
> **File:** `apps/ios/RaSi-Fiters-App/Features/Home/ProgramManagement/RoleManagementSection.swift`
> (section + `ManageRolesView`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/RoleManagementSection.swift`.
> **Web parity reference:** [`web program/roles`](../../web/program/roles/SPEC.md).
> **Consumes (features):** [`program-memberships`](../../../features/program-memberships/SPEC.md) — `fetchMembershipDetails`,
> `updateMembership(role:)`.
> **Stance:** faithful 1:1 port of legacy iOS. **D-REF (the run's load-bearing call): KEEP iOS-NATIVE** —
> the per-member spinner lock + refresh-after is kept over web's optimistic-write + rollback + cross-row
> disable-all. **+ 1 cleanup** (tokenize bare colors).

---

## 1. What it is + who uses it

The **Role Management section** of the Program tab — a program/global-admin-only card that summarizes who the
**Admins** and **Loggers** are, and pushes to `ManageRolesView` where an admin sets each member's role
(Admin / Logger / Member). The iOS analogue of web `/program/roles`.

## 2. Why it exists

To let managers assign program roles natively inside the Program tab, matching web `/program/roles`. Each
role change is a `updateMembership(role:)` call; the **last active admin** cannot be demoted (client guard +
backend 400). The whole section is gated `canEditProgramData` (loggers/members never see it).

## 3. Route / location

- **App:** `ios`. **Section mount:** `AdminProgramTab.swift:33-35` (only when `canEditProgramData`).
- **Manage Roles** row → `NavigationLink { ManageRolesView() }`.
- **Leaves to:** nav back; no forward-nav from `ManageRolesView`.

## 4. Contents / sections

- **Section card** (`RoleManagementSection.swift:15-138`) — `sectionHeader("Role Management")` + an **Admins**
  subsection (orange star) + a **Loggers** subsection (blue pencil), each a list of read-only `roleRow`s
  (avatar + name + "Global Admin" sub-label); an empty-state line when both are empty; the Manage Roles row.
- **`ManageRolesView`** (`:140-…`) — a `List` over `membershipDetails`; each row = avatar (role-colored) +
  name + role display name, then either a centered `ProgressView` (**while that member updates** — the
  per-member lock) or a 3-button capsule grid (Admin / Logger / Member) with a checkmark on the current role,
  disabled on the current role **and** on the last-active-admin. `.refreshable` → `loadMembershipDetails`;
  errors surface via an `.alert`.

## 5. Components + shared features consumed

- Chrome: `sectionHeader`/`settingsRow` (run 57), native `List`/`.alert`/bespoke capsule `roleButton`. Theme:
  `appOrange`/`appBlue`/`appPurple` + `Color(.systemGray)` (Member, semantic). **No new component** (D-DEPS).
- Features: `memberships` (`fetchMembershipDetails`, `updateMembership`).

## 6. Data / API

- `fetchMembershipDetails(token, programId)` (via `loadMembershipDetails`, loaded on the tab `.task` + pull-to-refresh).
- `updateMembership(memberId, role, isActive:nil, joinedAt:nil)` — sends **only `role`** on a change; guarded
  `member.program_role != newRole`.

## 7. Role-based view rules

| Role | Section visible | Manage Roles | Change roles |
|------|-----------------|--------------|--------------|
| **global_admin** | ✅ | ✅ | ✅ any member |
| **program admin** | ✅ | ✅ | ✅ any member (cannot demote last active admin) |
| **logger** | ❌ (section hidden) | ❌ | ❌ |
| **member** | ❌ (section hidden) | ❌ | ❌ |

- Section gated by `canEditProgramData` at the tab; `ManageRolesView` has no internal gate (reached only
  through the gated section; the backend re-verifies).
- **`admin_only_data_entry` — N/A.** Role management, not workout/health data entry (web program/roles: N/A).

## 8. States & edge cases

- **Loading:** rows appear as `membershipDetails` populates.
- **Updating:** the row being changed shows a centered `ProgressView` (per-member lock); **other members'
  buttons stay tappable** (the intentional divergence — D-REF).
- **Last active admin:** all three role buttons disabled + dimmed (client guard mirroring the backend 400).
- **Error:** an `.alert("Error")` with the message; dismissed on OK. No optimistic write — the list refreshes
  from the server after the mutation resolves.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Role Management ported **as part of the 3-section cluster in ONE run** (run 62) — section + `ManageRolesView`. | run 58/59/60/61 cluster-IS-the-run |
| **D-REF** | **KEEP iOS-NATIVE.** The per-member spinner lock (`isUpdating` gates only the updating member) + refresh-after-mutation is kept over web's **optimistic-write + rollback + cross-row disable-all** (web program/roles D-C2/D-C3). The per-member lock is finer-grained than web's disable-all; optimistic+rollback re-implements web's specific UX rather than closing a genuine parity gap. The **richer-iOS exception** to "resolve toward web". | run-61 "iOS richer → keep native"; memory [[ios-matches-web-not-just-legacy]] |
| **D-S1** | **Faithful 1:1** otherwise — active-admin filter, 3-button grid, last-admin disable, `updateMembership(role:)` payload all identical to legacy iOS (and match web's rules). | legacy `RoleManagementSection.swift`; web program/roles SPEC |
| **D-DEPS** | **No new dependency** — API fn / DTO / context wrapper / theme / section helpers all pre-ported. | grep-verified |
| **D-C1** | **Tokenize bare colors** — `.orange`→`appOrange`, `.blue`→`appBlue` in `roleRow`/`roleButton`/`roleColor`; `Color(.systemGray)` (Member) kept semantic. Light-mode-safe (run-26/61). | `RoleManagementSection.swift` |

## 10. Flagged characteristics (kept as-is)

- **F1 — per-member lock, no cross-row disable (D-REF).** While one member updates, others remain tappable
  (web disables ALL role buttons + writes optimistically). Kept native; concurrent role updates are backend-safe.
  Rebuild-note, not a bug.
- **F2 — no optimistic update.** The list refreshes from the server after each mutation (web writes to cache
  optimistically + rolls back). Kept native.
- **F3 — client last-active-admin guard mirrors the backend 400** (defense-in-depth; web program/roles F2).
- **F4 — only `role` sent on a change** (partial-update payload; web program/roles F3).
- **F5 — client role gating (JWT-decoded)** drives section visibility only; the backend re-verifies (web F1).

## 11. Changelog

- **0.1.0** (run 62, 2026-06-30) — initial port. Section + `ManageRolesView`; stub removed. Faithful 1:1,
  kept iOS-native per-member lock (D-REF), + D-C1 tokenize.
