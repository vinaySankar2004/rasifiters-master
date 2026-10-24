# Page: `members/person` (web) — a person's profile (People)

> **Status:** 🏗️ built (`apps/web/`, `b2ea09b`) — **live since 2026-10-13** (`PEOPLE_LIVE`; switched off, it redirects)
> · **Version:** 0.1.2 · **App:** `web` (Next.js App Router)
> **Route:** `/members/person?memberId=<id>` — one program member's profile: name, initials, role, workout stats, recent
> workouts and kudos; staff get "Open full stats", global admins "Edit membership". Reached from a row of the People
> list ([`members/list`](../list/SPEC.md) with `PEOPLE_LIVE`).
> **Provenance:** **NET-NEW** (reliability-overhaul Phase 4 Pass B — People S2; no legacy page).
> **Consumes (features):** [`people`](../../../../features/people/SPEC.md) 0.2.0 (`GET /api/people/:memberId`, `POST` /
> `DELETE /api/people/:memberId/kudos`; D-C13), [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (Open full stats lands on its pages), [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (Edit membership → `/members/detail`), [`frontend-kit`](../../../../features/frontend-kit/SPEC.md),
> [`auth`](../../../../features/auth/SPEC.md).
> **Cross-app:** iOS [`people`](../../../ios/people/SPEC.md) (`PersonProfileView`) and Android
> [`person-profile`](../../../android/person-profile/SPEC.md) — same copy (people D-C13); "Open full stats" differs by
> platform idiom (below).

---

## 1. What it is + who uses it
Every role that can open People: a header card (initials, name, `You` tag, `@username · Admin/Logger`), then — when
`activity_visible` — four stat pills (`Current streak`, `Longest streak`, `This month` → `N days`; `Last active` →
`Today` / `Yesterday` / `Oct 12` / `—`), `Recent workouts` (≤ 10; `No workouts logged yet.`) and the kudos block;
otherwise the line `This member keeps their activity private.` (or `You're hiding your activity, so other members' activity is hidden from you too. You can change this in My Profile.` when `viewer_hides_activity` — people D-C16)

## 2. Why it exists
People's social layer (people §1): see a co-member's workouts and give kudos, inside your own programs, under the one
visibility rule.

## 3. Route / location
- **Protected**; `useAuthGuard()` (an active program required). `PageHeader` `Profile` + program name, Back →
  `/members/list`.
- **While `PEOPLE_LIVE` is false** the page immediately `router.replace("/members/list")` (the roster); a missing
  `memberId` does the same.

## 4. Contents / sections
| Block | What |
|---|---|
| Header card | Initials avatar, name, `You` tag for self, `@username` + `Admin` / `Logger` marker. |
| Stats | The four pills (above) from `stats`. |
| Kudos (`components/people/KudosButton.tsx`) | `N kudos`; ONE toggle `Give kudos` ↔ `Kudos given` (`can_give` only); hint `You gave kudos today. Tap again to undo.` An undo decrements the count only when `removed`. 429 → `You've changed kudos too many times. Try again later.`; 403 `activity_hidden` re-fetches the profile. |
| Recent workouts | Type · date · duration, newest first. |
| Hidden | `This member keeps their activity private.` (or `You're hiding your activity, so other members' activity is hidden from you too. You can change this in My Profile.` when `viewer_hides_activity` — people D-C16) (stats / workouts / kudos are null). |
| Staff rows | `Open full stats` · `History, streaks, health` when `can_open_full_stats`; `Edit membership` · `Joined date, status, remove` for global admins → `/members/detail?memberId=`. |

## 5. Components + consumed features
`components/people/KudosButton.tsx`, `lib/api/people.ts` (`fetchPersonProfile`, `giveKudos`, `undoKudos`,
`PEOPLE_COPY`, `peopleKeys`), kit `ErrorView` / `FloatingBanner` / `fromQuery` / `retryNow`, `LoadingState`.

## 6. Data / API
| Call | Endpoint | Notes |
|---|---|---|
| `fetchPersonProfile` | `GET /api/people/:memberId?programId=` | people §3 §C. |
| `giveKudos` / `undoKudos` | `POST` (body `{ program_id }`) / `DELETE /api/people/:memberId/kudos` | people §3 §D / §E; a give or undo refreshes the profile + list queries. |

## 7. Role-based view rules
| Role | Sees / can do |
|---|---|
| **global_admin** | Every profile with activity; `Open full stats` (→ sets the view-as key `rf:members:view-as:<programId>:<viewerId>` and opens `/members`); `Edit membership`; kudos only where they are an active member (`can_give`). |
| **program admin** | Activity always; `Open full stats` (view-as, as above); kudos. |
| **logger** | Activity always; `Open full stats` → **`/members/workouts?memberId=&name=`** (that person's workout list — a logger's Members overview is always themself; sanctioned web divergence, people D-C13 / R13); kudos. |
| **member** | Activity unless the person hid it; kudos (not to a hidden member, not to self). |

## 8. States & edge cases
- Loading `LoadingState`; failed with nothing → kit `ErrorView` + Retry (offline copy while offline); stale → banner.
- A hidden member: name card + the private line only.

## 9. Decisions made
| ID | Decision | Rests on |
|----|----------|----------|
| **D-NP1** | **Dark until the store release (W1 / NP-U5)** — a redirect while `PEOPLE_LIVE` is false; reachable only from People once live. *(On since 2026-10-13.)* | web plan W1, W8. |
| **D-NP2** | **"Open full stats" per role (W6, R13)** — admins / global admins via the Members view-as key; loggers via `/members/workouts`. Coupled to `members/page.tsx`'s view-as key name. | web plan W6; people D-C13. |
| **D-NP3** | **"Edit membership" for global admins only (D-P11)** → the existing `/members/detail` editor (which loads its own data). | DECISIONS D-P11; web plan W7. |

## 10. Flagged characteristics
| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | ~~The streak shown can be stale (people F1 — `computeStreaks` doesn't reset).~~ | **RESOLVED** (server-side, 2026-10-14) — people 0.2.0 D-C15 / member-analytics D-C14: the current streak ends on the member's local today or yesterday, else 0, the same number as `/member-streaks` and the Members cards. No page change (the page renders `stats` as sent). |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.2 | 2026-10-24 | Hide my activity is reciprocal (people 0.3.0 D-C16): a hidden profile shows the you're-hiding-yours line when `viewer_hides_activity`. |
| 0.1.1 | 2026-10-14 | F1 resolved — the profile streak no longer goes stale (backend `fd6c15b`: people 0.2.0 D-C15, member-analytics 0.9.0 D-C14). Doc only; no page change. PATCH. |
| 0.1.0 | 2026-10-13 | Initial SPEC — net-new People profile page (Phase 4 Pass B, `b2ea09b`), dark behind `PEOPLE_LIVE`: header card, stats, kudos toggle, recent workouts, hidden line, Open full stats (role-specific), Edit membership (global admins), kit states. |
