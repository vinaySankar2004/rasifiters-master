# Feature Registry (L4) — RaSi Fiters

Human index of **shared feature specs** (cross-cutting capabilities). The machine mirror is
`registry.json`. One row per feature; `git-version` keeps both in sync and tags each
`feature/<feature>@v<version>`. Page/screen specs are indexed separately in
[`../pages/REGISTRY.md`](../pages/REGISTRY.md).

Status legend: 📄 documented → 🏗️ built → 🚀 deployed → ⊘ retired.
**Apps** = which clients consume it: `web ios` (shared), `web` (web-only), or `ios` (ios-only).

| Feature | Version | Status | Apps | Reference impl | Spec |
|---------|---------|--------|------|----------------|------|
| `auth` | 0.1.0 | 🚀 | `web` `ios` | `backend` (`routes/auth.js`, `services/authService.js`, `middleware/auth.js`) | [auth/SPEC.md](auth/SPEC.md) |
| `members` | 0.1.0 | 📄 | `web` `ios` | `backend` (`routes/members.js`, `services/memberService.js`, `models/{Member,MemberEmail}.js`) | [members/SPEC.md](members/SPEC.md) |

_First feature documented via `question-asker` (Phase 2 kickoff). `auth` gates everything else: it owns
the `/api/auth/*` routes, the Supabase-JWT verify middleware, and the authorization gates, and carries the
R1 Supabase-Auth migration delta. `members` (the FK-anchor entity) follows: five `/api/members` routes —
faithful except one deliberate change (`createMember` now creates a loginable member via Supabase
`createUser`, D-C2); `DELETE /:id` cascade deferred → 501 (D-C1, the auth `/account` pattern); `POST`+`DELETE`
are called by neither client. Next features are authored as the backend rebuild proceeds — see `PROGRESS.md`._
