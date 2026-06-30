---
name: question-asker
description: Run the ICM per-surface question loop before writing a feature SPEC — sweep the code read-only, fan out Explore agents to map then re-read load-bearing files to verify every file:line, batch the 6 generic questions into rounds, then ask code-grounded hypothesis-first follow-ups (lead each option with the faithful as-is choice), and fold the answers into the SPEC's §9 Decisions table + §10 Open-questions. Use when about to document a RaSi Fiters page/view/route/feature-module — i.e. before any SPEC.md is written. LIVING doc — append LESSONS_ARCHIVE.md every run.
---

# Question Asker — the per-surface SPEC question loop (LIVING)

The discipline that resolves **intent** before you document. The code answers *what* and *how*;
this loop asks the user only *why*, *which boundary*, and *deliberate-or-not* — then those answers
become the SPEC's §9 Decisions and §10 Open-questions. **This skill IS the codified per-surface loop.**
The feature-spec contract is in `../../../METHODOLOGY.md` §B (create it if it does not yet exist).

## Trigger
"document `<page/view/route/feature>`", "let's spec `<feature>`", "run the question loop", "ask me the
questions for `<X>`", or whenever you are about to start a feature SPEC and have **not yet**
resolved its scope boundary, guardrails, and faithful-vs-change stance with the user. Runs
*before* the SPEC is written — if you're already writing prose, you skipped this.

## Where to run
From a session rooted at `rasifiters-master/`. Cite `file:line` from the **surface being documented**.
The faithful-rebuild reference implementation is the LEGACY app at
`/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}` —
cite it as the baseline being faithfully ported. RaSi Fiters is ONE app with three surfaces (**apps**):
- **web** — Next.js 14 App Router (legacy: `rasifiters-webapp/src/app/**`, e.g. `summary/`, `members/`, `program/`, `lifestyle/`).
- **ios** — SwiftUI (legacy: `ios-mobile/RaSi-Fiters-App/Features/**`, e.g. `Home/`, `Auth/`, `Onboarding/`).
- **backend** — Node/Express + Sequelize (legacy: `backend/routes/**`, e.g. `members.js`, `workouts.js`, `analytics.js`, `auth.js`).

## Prereqs (confirm first)
- **Know the target.** Confirm with the user exactly which page/view/route/module this run covers.
  Check `COVERAGE.md` for its row + the **owning split**, and `specs/features/REGISTRY.md` for any
  neighboring features (that split is your lead option for the scope question). (These index docs may
  not exist yet on a fresh repo — create/seed them as the first runs land.)
- **Pick the spec KIND first — feature vs page/screen** (this chooses the template + sections, and
  changes question 1 — see §0 and §3):
  - **FEATURE SPEC** = a cross-cutting capability mounted/imported by pages/other modules, owning no
    standalone surface (auth, notifications, analytics). Lives at `specs/features/<feature>/SPEC.md`.
    First question is the **ownership/scope-boundary cut** — what this SPEC owns vs references as a dependency.
    A feature can be CLIENT-SPECIFIC: its `consumed_by` may be just `[web]` or `[ios]` (iOS widgets / deep
    links / push-token registration are ios-only; some bulk admin tools may be web-only) — confirm the
    consuming clients, don't assume shared.
  - **PAGE / SCREEN SPEC** = one page/screen a user lands on. Lives at
    `specs/pages/web/<page>/SPEC.md` (web) or `specs/pages/ios/<screen>/SPEC.md` (ios). First question
    is identity/purpose; **role-based view rules are a first-class, always-asked dimension** (see §0).
- The output contract is a single-file `SPEC.md`. The answers land in **§9 Decisions made** (a
  `D-xx` table) and **§10 Open questions / flagged characteristics (kept as-is)**. Both kinds share the
  §9/§10 question-loop output; the page/screen template adds role-based view rules (see §0).

## Workflow

### 0. Pick the spec kind — feature vs page/screen (do this first)
Before the sweep, decide which template you're filling — it sets the sections and question 1:
- **FEATURE SPEC** (`specs/features/<feature>/SPEC.md`) — a cross-cutting capability (auth,
  notifications, analytics). Q1 is the **scope-boundary cut**. Confirm `consumed_by` (which of
  web/ios/backend actually use it — possibly just one client).
- **PAGE / SCREEN SPEC** (`specs/pages/web/<page>/SPEC.md` · `specs/pages/ios/<screen>/SPEC.md`) — one
  page/screen. Q1 is identity/purpose. Fill these sections:
  1. **What it is + who uses it.**
  2. **Why it exists.**
  3. **Route/location** — which app (web/ios) + path/route.
  4. **Contents/sections** — the blocks on the page, each with reference-impl `file:line`.
  5. **Components + which shared features it consumes** (name the feature SPECs it depends on).
  6. **Data/API** — endpoints called.
  7. **Role-based view rules** — a TABLE mapping each role (global_admin · program admin · logger ·
     member) → what's visible / which actions are enabled, **including the effect of
     `admin_only_data_entry`**. This is **always asked** for a page/screen spec.
  8. **States & edge cases** — loading / empty / error / offline / permission-denied.
  9. **Decisions made** (`D-xx` table — the question-asker output).
  10. **Flagged characteristics kept as-is.**
  11. **Changelog.**
The §2/§3 question loop runs for both kinds; for a page/screen spec, role-based view rules (§7) are a
mandatory question dimension on top of the generic rounds.

### 1. Opening sweep — "agents map, I verify" (read-only, cite paths)
Map the target before asking anything. Inventory in order: frontend route/components/views
→ API/proxy endpoints → backend handlers → DB tables/columns → env/flags → **cross-app glance**
(same surface in the other apps — only to *notice* reuse/variation, not audit). For RaSi this
is usually a **web page ↔ iOS view ↔ Express route** triangle for the same domain concept (e.g. the
member workout log appears in `rasifiters-webapp/src/app/members/workouts`, `ios-mobile/...Features/Home/...`,
and `backend/routes/workouts.js`).
- **Fan out by sub-surface, not by file count.** For anything non-trivial (a multi-tab view, a
  multi-cluster component), launch 2–3 `Explore` agents — e.g. *web summary cluster · iOS home cluster ·
  backend route + cross-app wiring*. Agents produce the map fast.
- **Then verify.** Re-read the 2 biggest load-bearing files in full + spot-check the rest. **Every
  `file:line` that will land in the SPEC must be confirmed against source by you, not trusted from
  the map.** This catches drift the map glosses (wrong path, a prop/binding passed-but-unused).
- Produce a short **surface map** (frontend → api → backend → data → flags) and **auto-tag** the
  feature-modules it touches. Surface the **single biggest cross-app divergence** now (e.g. a
  control that exists on web but not iOS, an admin-only gate on one client) — it is usually the run's
  biggest decision, and §3 resolves it first.
- This is the first pass only. §4b re-sweeps before sign-off.

### 2. Generic questions — two batched rounds
The 6 generic questions exceed `AskUserQuestion`'s **4-per-call cap** → split into rounds. Lead
every option with the **faithful as-is** choice.
- **Round A — identity / purpose / scope / guardrails** (`AskUserQuestion`, ≤4 Qs):
  1. *What is this, in one line — who uses it?* (For a **module**, replace with the **scope-boundary
     cut** — see §3; lead with the COVERAGE / existing-ownership split.)
  2. *Why does it exist — what job does it do?*
  3. *What are the 1–3 main actions/flows?*
  4. *What must it absolutely NOT do?* (guardrails/constraints)
- **Round B — code-grounded must-knows** (`AskUserQuestion`, ≤4 Qs): the client-specific-vs-shared
  question (does web/iOS behave the same here? is this feature even consumed by both clients, or is it
  web-only / ios-only?) + the desired-changes question, **fused with the §3 dynamic follow-ups** the
  sweep raised, so Round B is mostly real, cited decisions rather than generic prompts. For a
  **page/screen spec**, also batch the **role-based view rules** here (what each of global_admin ·
  program admin · logger · member sees / can do, incl. `admin_only_data_entry`) — §0.7.

Park nice-to-knows; resolve must-knows before writing. If the user has already given a "faithful
rebuild unless a real bug is found" stance, the rounds get short and confirm-heavy.

### 3. Dynamic questions — the heart of the loop
As you read, generate targeted follow-ups. Discipline:
- **Ground every question in something you saw** — cite `file:line`.
  ("`members/workouts/page.tsx:31–78` `LogButton` has no `onClick` — display-only on purpose?")
- **Only ask what the code can't answer** — intent, business rules, "why", priority, expected
  edge-case behavior, deliberate-vs-accidental. Never ask what you can read.
- **Hypothesis-first** — "Looks like this does Z; right?" beats an open question.
- **Surface variation/ambiguity as a decision** — present the options, let the user pick.

**The converged "tight shape" (for a confirm-heavy faithful rebuild):** the fast round is
**3 questions, one `AskUserQuestion` call**:
1. **Scope cut** — what's in vs referenced-as-dependency. *Lead with the COVERAGE / existing-ownership split.*
2. **Borderline UI** — the one renderer/control whose ownership is genuinely ambiguous.
   *Lead with "UI here, mechanics deferred"* (the surface owns the rendering; the neighbor owns the
   mechanics/data/endpoint).
3. **Stance** — faithful-as-is vs change-now. *Lead with "faithful, flag oddities as known
   characteristics."*
Each option **leads with the faithful as-is choice**.

**Module-vs-page rule:** for a feature-MODULE, question 1 is *always* the ownership/scope-boundary
cut — "which sub-components does this SPEC own vs reference as a dependency?" — because a module
physically contains pieces of its neighbors (a home shell holds the program picker; a detail view
holds page-state that belongs to the analytics feature). Resolve the boundary first; everything
else follows. **"UI here, mechanics deferred" is the master cut** for a component wedged between
stateful neighbors. Watch for **one component split by AXIS, not by file** (owns the component ≠
owns the state that drives it) — the tell is the same name appearing in two COVERAGE / feature items.

**Recurring high-value templates** (reach for these every run):
- *"Where is X enforced / sourced?"* — for any limit/guardrail/gate (e.g. the admin-only data-entry
  lock: is it enforced in the Express route, the web UI, the iOS view, or all three? the answer
  changes security posture).
- *"Is this the client copy or the server copy?"* — the generalization (a filter applied to
  already-loaded rows client-side vs a query param hitting an Express endpoint — two features, one word).
- *"What's the single biggest cross-app divergence (web vs iOS), and which side wins?"* — resolve first.
- *"Mount here, internals deferred?"* — for providers/theme/overlays/auth-context: document *where* it
  mounts + the one hook a sibling drives, defer internals to the dedicated later feature.

### 4. Completeness-critic pass before sign-off
Don't trust the first sweep. Re-sweep from independent angles (frontend · backend+data ·
config/flags/edge-cases · cross-app web↔iOS), each grounded in `file:line`; anything new may
raise a §3 question. Scale to the target — a leaf page needs one re-sweep; a shell/home-hub warrants
all passes, fanned to parallel agents. Then the **critic templates** (these earn their keep on chrome
and components):
- *"Does every button / menu-item / tab actually DO something?"*
- *"Any prop/binding received-but-unused? Any child view mounted-but-dead?"*
- *"What did we miss — a route, a flag, a table, a state, an edge case, a client that diverges?"*
Only sign off when a critic pass turns up nothing new. Dead/placeholder controls under the faithful
stance become **§10 flagged characteristics** (kept as-is, rebuild-cleanup candidates).

### 5. Fold answers into the SPEC (the output contract)
The loop's answers become two SPEC sections:
- **§9 Decisions made** — one `D-xx` row per resolved question. Use stable IDs (`D-C1`, `D-C2`, …;
  `D-REF` for the reference-impl/cross-app decision; a stance row for faithful-vs-change). Each
  row states the decision + the `file:line` / COVERAGE item it rests on. The scope cut, the
  borderline-UI cut, and the stance from §3's tight shape are usually the first rows.
- **§10 Open questions / flagged characteristics (kept as-is)** — every "deliberate oddity, kept
  under the faithful stance": no-op controls, vestigial props/bindings, client-only behaviors,
  load-bearing parsers/transforms that ripple across neighbors, web-vs-iOS divergences left intact.
  Each cites `file:line` and notes whether it's a rebuild cleanup candidate.
Then present the surface map + draft decisions for sign-off, tick `COVERAGE.md`
(`[x]` fully covered, `[~]` partial with the owning split spelled out), and note the reference impl
(which legacy path it faithfully ports). After the SPEC is signed off, the code is **implemented
directly as a faithful port from the legacy reference app** — there is no intermediate assembly step.

### 6. AskUserQuestion mapping (mechanics)
- **1–4 questions per call, 2–4 options each.** The 6 generic questions → 2 rounds; the tight
  faithful shape → 1 round of 3.
- **Always lead with the faithful as-is option** as the first choice in every question.
- Make options *decisions*, not open prompts — multiple-choice where possible; reserve free-text for
  genuine unknowns.
- Batch independent questions into one call; only serialize when a later question depends on an
  earlier answer.

## Converged lessons (durable — fold new patterns here as they recur)
- **The tight 3-Q shape:** one question for the **scope cut**, one for the **borderline boundary**
  (what's in vs referenced), one for the **stance** (faithful-as-is vs change). Extend to 4 only when
  there are genuinely independent decisions (decide-heavy runs: auth, home-shell).
- **Count the genuinely-open decisions; don't manufacture questions** to hit a number.
- **Lead every option with the faithful as-is choice** as the first pick.
- **Hypothesis-first, code-grounded:** state the likely answer from the code (cite `file:line`), ask the
  user to confirm/correct — never an open "what do you want?".
- **Module vs page:** document the load-bearing module once; reference it from the pages/views that
  mount it (don't re-ask per page).
- **Completeness-critic pass before sign-off** (§4b): re-sweep from independent angles incl. web↔iOS;
  if a question's answer wouldn't change the SPEC, drop it.
- **Cross-app divergence is RaSi's signature decision:** web and iOS often render the same domain
  concept differently (a control present on one client, an admin gate on another) — and some features
  are client-specific (`consumed_by` = just `[web]` or `[ios]`). Surface it in §1, resolve "which side
  wins / keep both / single-client" first in §3, record it as `D-REF` in §9.
- **Page/screen specs always carry role-based view rules:** map global_admin · program admin · logger ·
  member → visible/enabled per page, incl. the `admin_only_data_entry` effect (§0.7). It's a mandatory
  question dimension, not an afterthought. (When a page is pre-auth, the answer is "N/A — no role exists
  yet"; say so explicitly rather than omitting the section — splash/login runs 15–16.)
- **A page can be faithful-1:1 PLUS one deliberate addition — keep the addition scoped, defer the rest (run
  16).** When the user mandates a *net-new capability* on an otherwise-faithful page (login + auth-recovery),
  the stance is NOT pure-faithful and NOT a rewrite: it's faithful-1:1 **plus ONE addition** (a link/control),
  recorded as its own `D-C1`, with the heavy machinery (new pages, new backend routes) pinned in a **`D-PLAN`
  row** and pushed to follow-up specs. Lead the scope question with *"this page only + plan the rest"* vs
  *"build the whole path now."* And for a net-new **cross-surface** capability, the opening sweep must fan an
  agent over **your own rebuilt stack** (ported web + backend + the feature SPEC), not just the legacy
  reference — the "what's already half-built" finding (run 16: `register` already makes loginable users;
  Supabase `resetPasswordForEmail` exists but is unrouted) reshapes the work from "build everything" to "wire
  the gap." When the user's verbal intent has a privacy/security footgun (run 16: "detect no-email then
  branch" = an account-enumeration vector), offer it as the lead option but **also offer + recommend the
  leak-free default** (always-send + always-visible fallback); they often take the safe one. Save the mandate
  to memory at the top of the run, and **update that memory mid-run** when a decision supersedes the initial
  assumption. **The follow-up that builds the deferred machinery: cut a multi-step net-new flow BY PAGE —
  each page paired with the SINGLE backend route it calls — not "all backend now, pages later" (run 17:
  forgot-password page + `POST /auth/forgot-password` this run; reset-password page + `POST /auth/reset-password`
  next).** Each slice builds something that works end-to-end; the cost is one MINOR bump per route (cheap —
  the changelog records each), and it beats a guessed "one bump for both routes." Lead the scope question
  with the smallest by-page slice. **A net-new page is still "faithful" — to the SIBLING pages' chrome**
  (run 17 D-S1: reuse the established `BrandMark`/`motion`/`input-shell`/`rf-*` design language verbatim),
  not to a legacy file that doesn't exist. And **don't auto-inherit a sibling page's flagged kept-as-is
  characteristic — re-evaluate it against THIS page's input semantics** (run 17: login's "no inline
  validation" F5 was kept because its identifier is username-or-email; forgot-password's field is
  email-only, so inline format validation IS meaningful — recorded as a deliberate divergence D-C2,
  cross-referencing the sibling's F-row). For a privacy-safe recovery request, the backend contract is
  **always-200 generic message** (never reveal existence), Supabase errors swallowed, the API called only
  on a format-valid email; the client mirrors it (a genuine 500 ≠ existence info → neutral retry message,
  not the leak), and the `mailto:` fallback is **always visible** precisely because placeholder no-email
  accounts can't receive the email at all. **The SECOND half of a by-page net-new slice often reuses an
  existing backend fn — don't reflexively add a new one (run 18).** `POST /auth/reset-password` is just
  `authenticateToken` + the existing `changePassword` because the managed provider's recovery token is a
  normal access JWT the verify middleware already accepts; the password update + policy stay single-sourced
  (the recovery token substitutes for the authed bearer). So run-17's "each page paired with the SINGLE
  route it calls" holds, but the route can be a thin handler delegating to a shared fn. **The provider's
  FLOW TYPE is a load-bearing, code-determined fact — grep the SDK default before designing token
  transport.** When the BACKEND initiates a flow but an ARBITRARY BROWSER completes it (backend calls
  `resetPasswordForEmail`; the locked-out user's browser lands on the reset page), **PKCE is unusable** (the
  code verifier strands server-side) — the **implicit/fragment** path is forced: the email link delivers the
  session in the URL `#fragment`, the page reads + **scrubs it from history** (`history.replaceState`), and
  forwards the token through Express (R1). Pin `flowType: "implicit"` explicitly even when it's already the
  default (defensive against an SDK flip). And re-apply run-17's "don't auto-inherit a sibling's kept-as-is
  choice" in the OTHER direction: a set-new-password screen warrants a **confirm field + inline policy hint**
  (mirroring the server password policy) the single-password login/forgot fields don't — a password the user
  can't see-and-retype is a lock-out-inducing typo. Keep recovery **separate from login** (redirect to
  `/login?reason=…` with a new banner case — a cheap patch bump on the sibling page that records the ripple)
  rather than auto-login (which would embed provider-shaped tokens as a client session — extra plumbing + R1
  tension). Collapse the page's invalid-token paths (fragment `#error`, no token, submit-time 401) into one
  "request a new link → forgot-password" state.
- **A mandated change is often already satisfied elsewhere — confirm WHERE it holds before implementing (run
  19).** A D-PLAN/user mandate phrased as backend-sounding work ("sign-up email mandatory + format-validated")
  was already true server-side (`register`/`createMember` require + normalize + format-validate email) — the
  only gap was the *client* page's inline regex. This is run-16's "sweep your OWN rebuilt stack" again: it
  reshapes a mandate from "build it" to "wire the one missing client gate," and locates the work correctly.
  Three more run-19 patterns: **(a) a page port can drag in shared UI-component dependencies** not yet in the
  foundation (`Select`→`SelectMobile`→`useIsMobile`) — port them verbatim once their transitive deps exist;
  **(b) the NO-feature-bump page** — when a page consumes an already-existing route + client fn (`POST
  /auth/register` + `registerAccount()`), no feature SPEC version changes; the only versioned artifact is the
  page SPEC at v0.1.0 (say so — it's the clean case, vs runs 17/18 which each added a route → an auth MINOR);
  **(c) reconcile mutually-exclusive multiSelect picks by taking the SUPERSET, note the merge, don't re-ask** —
  user selected both "conditional hint" + "live checklist"; implement the richer one (the live checklist appears
  on first keystroke, subsuming the conditional behavior) and record the merge in the D-row. And the run-17/18
  "don't auto-inherit a sibling's choice" cuts BOTH ways on redirects: legacy create-account had no authed
  redirect, but all 3 sibling auth pages redirect — when the WHOLE sibling set already diverged one way,
  matching them (a deliberate D-row) beats matching a lone legacy file.
- **A pre-flagged DEFERRED decision becomes a run's D-row when its blocking page lands — and a migration-FORCED
  decision leads with closest-to-faithful-INTENT, not faithful-literal (run 20).** The `programs` hub (first
  protected route) carried a standing open question (the edge `middleware.ts` verified HS256 but auth migrated to
  Supabase ES256 → would redirect-loop every real session). Resolve it AS PART OF the page run, recorded as a
  D-row (D-C1), not left dangling. Because the faithful HS256 port was *non-viable* on the new stack, "faithful
  as-is" wasn't a real option — this is the auth-run-1 shape: a **migration-forced** decision where you lead with
  the option that preserves the faithful ROLE, not the faithful CODE. Here the middleware's role is a **UX
  redirect gate**, not the security boundary (the backend JWKS-verifies every API call + owns all authz — not
  RLS), so "decode + expiry only" preserves the role while fixing the algorithm; offer it as the lead vs
  edge-JWKS-verify (adds a per-nav network fetch + duplicates backend logic) vs remove-middleware (diverges from
  legacy). Frame the security honestly: dropping edge signature-verify doesn't weaken anything when the backend
  re-verifies every call. The run-19 "page drags in shared deps" pattern **recurs and scales** (run 20: 2 api
  modules + 5 `ui/` components) — the discipline holds: confirm the transitive deps (`cn`, a `format` helper) are
  already ported, then port WHOLE shared api modules (later pages reuse them) but only the SPECIFIC leaf
  components this page uses (not the sibling `ui/` files that belong to their own pages); `cp` verbatim for
  byte-fidelity, then apply the deviation edits. And **a page port can reuse a foundation hook the legacy file
  predated** — swapping the page's inline login-redirect `useEffect` for the foundation's `useAuthGuard` is a
  legit reuse cleanup (D-row), but mind the hook's parameters (`requireProgram:false` here — the hub is WHERE you
  pick the active program, so the default `requireProgram:true` would bounce it to itself). Check the foundation
  for a hook/util that subsumes inline page logic before porting that logic verbatim.
- **For an OVERSIZED page, the scope cut IS the run — and a pre-named cleanup needs no pinning round (run 21).**
  When a page drags in a heavy write path (run 21: `/summary` ~1,700 LoC incl. a 500-line `BulkLogWorkoutForm`,
  3 modal forms, 3 api modules, 6 sibling sub-routes), the highest-value decision is the **scope cut**: what
  THIS page SPEC owns vs defers. Lead with the **"one page that WORKS end-to-end" slice** — the landing page +
  its embedded modals (desktop write path live) — and defer the separately-inventoried sub-routes as their own
  rows (links to them are forward-nav, the recurring F2). Reject the read-only slice that leaves core action
  controls dead (an awkward half-page) and the whole-bundle mega-run. **Don't manufacture a scope-pinning
  multiSelect when the stance option already NAMES the cleanup** — if the chosen stance option says "type
  ProgramProgressCard's prop", the user endorsed that exact cleanup; apply it as a D-row and move on (the
  pinning multiSelect is for "change now" selected WITHOUT a named target). Two corollaries: **(a) "backend
  coverage complete" pays off at the consuming page** — a web page consuming N endpoints needs ZERO backend
  work; the sweep's job is to CONFIRM each endpoint is mounted (`server.js`), not to port — say "all endpoints
  already mounted" explicitly. **(b) the rebuild can flatten a legacy nested workspace to top-level routes** —
  confirm the route shape from the navigation CALL SITE (`saveActiveProgram` + `router.push("/summary")`), not
  from the legacy directory tree (run 21: `/summary` is top-level, not `program/[id]/summary`).
- **Separate locked-by-METHODOLOGY decisions from genuinely-open ones before asking.** Decisions already
  fixed in the R-log (e.g. R1's proxy model / retired tables / `auth_user_id`) are stated as context, NOT
  re-asked — keeps the round to the few real choices (auth run 1: 4 real Qs, all faithful).
- **Migration features get a "migration delta" section** (what STAYS vs what CHANGES) — for any feature
  ported onto a new stack/provider it's the highest-value part of the SPEC and keeps the
  faithful-vs-changed line crisp (see `specs/features/auth/SPEC.md` §7). The load-bearing question for a
  "self-signed JWT → managed auth provider" migration is the **token-verify claim source** (verify method
  + whether you add a per-request DB lookup) — lead with it. **Grep for EVERY verify call, not just the main
  middleware:** SSE/streaming/EventSource endpoints carry their own bespoke inline `authenticate*` middleware
  with the same `jwt.verify` (easy to miss) — each needs the same migration, and the streaming one also needs
  a **query-param token source** (`?token=` — browser `EventSource` can't set headers). The faithful port
  extracts the shared verify+rebuild helper and adds a header-or-query wrapper (notifications run 5, D-C2).
- **A feature can have several INDEPENDENT deferral axes — ask each separately when the code degrades
  gracefully for it.** notifications (run 5) had three orthogonal deferrals: the SSE-auth migration (D-C2),
  APNs credentials (D-C4 — `getProvider()→null` already warns+skips, so "port now, creds later" is low-risk),
  and the cross-feature emit/cascade wiring (left to the OTHER features). Don't fold them into one "stance"
  question. And **"owns the emit engine" ≠ "owns every emit call site"** — the engine feature owns the engine;
  the callers own their calls. Pin this in the scope question so a keystone run doesn't sprawl into wiring N
  dependent features. The **deferred named-API stub** (run 4) is the seam: porting the keystone REPLACES the
  one stub file and every by-name caller lights up unchanged (confirmed run 5). **The inversion (run 6):**
  once the keystone is ported, a downstream feature that consumes it has **NO deferral axis for it** — the
  faithful behavior IS the live behavior. Don't reflexively offer a stub; *confirm live* (invites' invite
  emits wired live, no stub). And **a feature's owning tables may already be ported by a neighbor that WRITES
  them** — program-memberships' exit cascade (run 4) ported invites' `ProgramInvite`/`ProgramInviteBlock`
  models + associations, so the invites port was routes+service only. Before treating model-porting as work,
  `ls models/` + grep `models/index.js` associations — the cross-feature-write feature often lands the schema
  first.
- **Dead-route AND dead-param check via the consumption sweep:** before speccing a backend CRUD feature, the
  cross-app sweep must confirm **which routes each client actually calls AND which request fields each sends**
  — a route/param existing ≠ used. Routes called by *neither* client are vestigial: keep them for parity but
  **flag** them (§10), don't treat them as load-bearing (members run 2: `POST`/`DELETE /api/members` are called
  by neither web nor iOS — it reframed the whole feature). Likewise a request param destructured by the
  service but sent by *neither* client AND read by no path is a vestigial param (invites run 6:
  `target_member_id`) — have the sweep enumerate request-body fields per client, not just endpoints. When a
  vestige's faithful behavior is a **latent bug** (members' `createMember` ignores `password` → unloggable
  member), surface it as a decision (faithful-keep vs fix-now) — the user often picks fix; then a
  **scope-pinning follow-up** locks the mechanics (the email source Supabase `createUser` needs; that the
  cleanup is createMember-only) so the SPEC stays prescriptive. The pinning follow-up generalizes to *quality*
  cleanups too (invites run 6: a multiSelect locking exactly "drop `target_member_id`" + "batch the N+1",
  everything unselected staying faithful + flagged — the fixed N+1 still recorded as the legacy F-row).
  Also: any "returns full rows" handler may now **leak a migration-added column** (`getAllMembers` +
  `auth_user_id`) — exclude it to preserve the legacy response shape. **A defined api-client function is NOT
  proof of consumption** (workouts run 7): web's `fetchWorkouts` existed but was never imported — grep CALL
  SITES, not the definition, or you'll invent a consumer. Record `consumed_by` by live call sites and flag the
  dead wrapper; run 7 went `[web, ios]`→`[ios]` because the *entire admin CRUD* was called by neither client
  and only `GET` was live. **Byte-dup vs vestigial-but-distinct route:** a route called-by-no-one that is
  *character-identical* to another (workouts' `POST /mobile` == `POST /`) carries zero behavioral info → the
  cleanup is **drop** (D-C2), not keep-and-flag; a distinct-but-unused route is keep-for-parity + flag. Only
  the duplicate is safe to remove under the faithful stance.
- **One legacy service FILE can map to TWO COVERAGE rows → the scope cut is pre-drawn; port-split the file.**
  workouts run 7: `services/workoutService.js` held the global library (this feature) + the program-scoped
  functions (`program-workouts`, the next feature) — COVERAGE already separated them, so Q1's scope answer was
  settled. Own your half, split the file on port (take only your functions), and name the sibling as owner of
  the remainder in a §7 scope note + D-C1. **And state "no migration delta" explicitly** when the model+schema
  already landed with an earlier feature (run 7: `Workout`/`workouts_library` pre-ported) — an empty "what
  changes" (but for one route drop) still belongs in §7 to keep the faithful-vs-changed line crisp.
- **The "one deliberate change" can be an ARCHITECTURE hoist, not a behavior change — and then status-code
  fidelity is the load-bearing follow-up.** When a feature repeats the same authorization block inline
  across N functions AND a sibling already uses route middleware for an analogous gate (program-workouts
  run 8: 5 inline admin checks vs `workouts`' hoisted `isAdmin`), surface "keep inline (faithful) vs hoist
  to middleware (match sibling)" as its own decision — the code can't answer *where authz should live*.
  **If the user hoists, it's only faithful when 403 fires at exactly the legacy point.** Legacy ran the
  inline check *after* the service's validation/lookup/type guards, so non-admins hit 400/404 *before* 403;
  a naive "403-first" middleware silently flips those (CLAUDE.md non-breaking violation). The faithful port
  is **resolve-or-pass-through**: a `requireXAdmin(resolveId)` factory whose per-route resolver returns the
  target id (gate the 403) or **null to pass through**, so the service still emits its native pre-check
  400/404. The resolver must mirror *every* guard the legacy fn ran before its inline check (missing field,
  row-not-found, wrong-type), loading the row for `/:id` routes (accept one extra by-PK read; keep
  middleware↔service decoupled). And **a same-named pre-scaffolded middleware isn't automatically the right
  tool** — grep its usages (run 8's generic `requireProgramAdmin` was unused AND 400'd where the SPEC needed
  pass-through) and verify exact semantics vs the decision; a feature-specific guard belongs co-located in
  the route file, leaving the generic helper untouched.
- **NOT every authz block is hoistable — separate a pure pass/fail GATE from a boolean that drives
  BRANCHING (run 9).** Before offering "hoist?", classify each inline check: a **throw-or-pass gate** (e.g.
  workout-logs' `assertDataEntryAllowed` program-lock) is hoistable to resolve-or-pass-through middleware; a
  helper whose **return value is consumed by the function body** (e.g. `resolveLogPermissions` →
  `canLogForAny`, used to decide *which member* you may act on) is business logic and **stays inline** —
  hoisting it is wrong. A feature can have one of each: hoist the gate, keep the boolean; say which in the
  decision. **When a cleanup hoists/moves a check whose legacy position was AFTER other validations, the
  residual is a status-ordering shift** (locked + non-admin + invalid-body → 403 where legacy gave 400; a
  de-duped check hoisted above a privacy pre-check → 403 before a 404) — surface it as an *accepted* nuance
  (an F-row + a note in the decision), don't bury it. **And the file-pair split (run 7) extends to the ROUTE
  file + the SHARED HELPERS:** the first-ported half takes the shared helpers (they live once); the deferred
  half's solo helper and any gate the first half hoisted away aren't ported yet — leave them for the sibling
  with a §7 scope note (run 9: daily-health re-adds `assertDataEntryAllowed` or adopts the hoist). Changed
  legacy shapes from accepted cleanups still get F-rows (run 9: F7–F9). **Resolved run 10: when the FIRST
  half already hoisted a gate, the second half's lead choice is CONSISTENCY (reuse the sibling's middleware),
  not legacy-literal-faithful** — re-adding the inline helper would make one file enforce the lock two ways;
  the reuse is a real `depends_on` edge to the sibling. And **don't assume the two halves have symmetric
  consumption** — run 9's half had 2 dead routes + a web-only endpoint; run 10's half was fully shared, no
  dead routes, no batch route. Sweep each half independently.
- **Verbatim-aggregation features (analytics, reporting): port the SQL EXACTLY, and a TZ "fix" that is a
  no-op on the deploy target is a low-risk cleanup (run 11).** For a pure read feature whose numbers must
  match legacy, D-S1 is faithful *verbatim* — every `Promise.all` aggregation, inner-join, `fn("COUNT","*")`
  idiom, and response shape is ported character-for-character; resist "improving" the queries. Two run-11
  specifics: (a) **a versioned-API supersession is a new dead-route flavor** — a v1 endpoint can be dead not
  because it's a byte-dup but because a v2 successor (living in the SIBLING feature) replaced it on every
  client; confirm by sweeping for the v2 URL too, then drop-or-keep like any dead route (the behavior isn't
  lost, it's relocated to the sibling). (b) **server-local-timezone date formatting** (`toLocaleDateString`/
  `Intl` with no `timeZone` option, while the surrounding code parses UTC midnight) is the classic latent bug
  in date-bucketing code — surface it as a cleanup, **split by impact** (numeric bucketing vs display labels),
  and frame the risk honestly: a TZ fix that is a **no-op on the deploy target** (Render-UTC) but makes the
  UTC intent explicit is low-risk ("unchanged on UTC, just deterministic"). **Scope the cleanup precisely** —
  the same root cause often recurs at sites the user did NOT pin (`buildMTDDateRanges`, period labels); leave
  those faithful + flagged, don't silently widen the fix. **(c) The versioned-dead-route supersession is
  SYMMETRIC — the mirror-drop (run 12).** Run 11 dropped a dead *v1* route because clients used the *v2*
  successor; run 12 dropped a dead *v2* route (`/summary`) because clients kept the *v1* predecessor. So when
  you port the SECOND half of a versioned file pair and the first half already dropped its dead versioned
  route, the consistency move is to **drop the second half's dead versioned route too** — each version sheds
  the half-route its clients abandoned, and the dead one can point EITHER direction; confirm by sweeping for
  BOTH the v1 AND v2 URL of any overlapping endpoint, per client. The drop can also delete the only instance of
  the first half's cleanup class (run 12: the dead v2 summary held the sole TZ-bucketing site), so the second
  half may need **fewer** cleanups than the first — mirror the *drop*, not reflexively the cleanups. And when an
  earlier feature dropped fn X as dead while the sibling reinstates a byte-identical copy under a different
  name/route that IS live (run 12: `getParticipationMTDV2` ≡ the dropped v1 `getParticipationMTD`), that's
  faithful — flag the two-names-one-body dup, don't re-drop it. **(d) The RE-EXPORT wrinkle — the inverse of
  the file-pair split (run 13).** When an earlier feature ported a shared service file and trimmed internal
  helpers from its `module.exports` because *nothing consumed them yet* (correct then — v1/v2 analytics dropped
  `resolveTimelineWindow`/`buildBuckets`/`bucketKey`), a LATER **separate-file-pair** feature that `require`s
  those helpers from the sibling gets `undefined` → runtime crash. The faithful fix is to **re-add the names to
  the sibling's exports** (restore the legacy export surface) — single-sourced, NOT duplicated into the new file
  (byte-dup / drift). It's a tiny additive NON-behavioral change to an already-built feature → a touched file at
  commit + a **patch bump** on that sibling. Detect early: in the opening sweep, grep the target service's
  cross-service `require`s and confirm each imported name is actually exported by the *ported* sibling, not just
  the legacy one. Offer "re-export (faithful, single-sourced) vs duplicate locally"; re-export leads.
- **Sibling read features need NOT share the same authz posture — check each (run 13).** v1/v2 analytics are
  `authenticateToken`-only (no per-program read gate, their F2); `member-analytics` enforces `ensureProgramAccess`
  on every route. Don't assume a neighboring analytics/read feature's authz stance carries over; here it flipped
  absent→enforced, recorded as the *secure* characteristic (F1), kept as-is. And (reinforces run 9) **don't
  de-dup checks that target DIFFERENT entities**: `ensureProgramAccess` gates the REQUESTER while a separate
  `ProgramMembership.findOne` verifies the TARGET `memberId` is enrolled (404) — they look like a double-lookup
  but check different members; the safe cleanup extracts the *repeated 400/403/404 prelude* (keeping both
  lookups), it does not merge the two queries. Exclude any sibling fn with a different shape / distinct error
  message from the extraction (run 13: `getMemberMetrics`' "Program membership required." vs the single-member
  "Active program membership required.").
- **The DOCUMENTATION-ONLY / already-ported feature, and "own-vs-reference" for a bundled COVERAGE row (run 14).**
  Some features have **no code left to port** — their pieces already landed with earlier features (app-config
  was inline + byte-identical; the whole push/APNs surface landed with `notifications`+`auth`). The FIRST move
  is to **confirm by grep/diff** that nothing remains, *then* the SPEC's job flips from "port + document" to
  "document + index." For a **bundled COVERAGE row** ("app-config + push"), split it: **OWN the genuinely-
  undocumented piece** (app-config) and **REFERENCE the already-documented piece** via a cross-reference index
  section (a §6 map of the end-to-end path pointing to the owning SPECs) — **do NOT re-document it** (that
  duplicates the sibling SPECs = the exact single-source-of-truth violation `health-check` flags). Lead the
  scope question with "own X, reference Y." And **documentation-only ≠ faithful-only**: still ask the stance —
  the user may pick "change now" even on a doc run (run 14: 2 cleanups, `Cache-Control` + env validate/trim),
  so run the same scope-pinning multiSelect (concrete code-grounded cleanups; unselected stay faithful +
  flagged) you'd use on a port. The consumption sweep settles `consumed_by` for **every** half of the row, and
  **"iOS-only" / "web-only" is a real answer** (run 14: app-config AND push are both `[ios]`; web consumes
  neither — no version to gate, SSE not APNs — recorded as a flagged characteristic, not a divergence).
- **A page named like a CRUD/management screen may actually be a read-only dashboard — verify the LANDING file
  yourself before trusting the map (run 22).** An `Explore` agent infers a page's job from its directory name +
  sibling files and will list CRUD deps that actually belong to *deferred sub-routes* (run 22: an agent called
  `/members` "roster management" + listed `fetchMembershipDetails`/`update`/`remove`; the real landing uses only
  `fetchProgramMembers` for a view-as picker + 5 read-only analytics calls — the CRUD lives in `/members/list`
  + `/members/detail`, both deferred). The landing file is the source of truth for what THIS run owns; read it
  in full. Corollary: a read-only page makes **`admin_only_data_entry` N/A** — say so explicitly (it gates the
  log forms on other tabs, not this one). Two more run-22 cleanup patterns: **(a)** when the user picks a
  structural de-dup you recommended AGAINST, honor it behavior-preserving — two near-identical render blocks
  gated by *mutually-exclusive* state collapse to ONE render via an `activePicker`-style discriminant that
  carries each block's exact differences (props, storage side-effects, setters), never a `.map()` that flattens
  a branch's nuance; **(b)** for a read-only page with no `any`/typing debt (so summary's typed-prop cleanup has
  no analogue), the clean pinned cleanup is a **hoist-to-shared-util** — move a page-local pure helper
  (`formatDuration`) into `lib/format.ts` so the deferred sub-routes that also use it single-source it. Offer the
  hoist as recommended; flag structural de-dups as recommend-against. **Run 23 confirmed the pattern recurs +
  added a corollary:** `/lifestyle` was a SECOND "name-lies, actually-read-only-dashboard" page (a near-twin of
  `/members` — same view-as picker, same role gating). Two takeaways: **(a) a near-twin page reuses its twin's
  decision shape — confirm, don't re-derive** (same D-SCOPE landing-only, same faithful D-S1, same "port whole
  api module" D-C, same read-only→`admin_only_data_entry`-N/A); the run is fast because you recognize the twin.
  **(b) de-dup WITHIN a file is behavior-preserving, but de-dup ACROSS files that already DIVERGED is not —
  decline the cross-file extraction.** `/lifestyle`'s local `MemberPickerModal` duplicates `/members`', but the
  Members copy was already specialized (run-22's 2-variant `activePicker`), so extracting a shared `ui/` picker
  would carry BOTH tabs' union of props/branches (adds branches, doesn't remove them). Flag the dup (F-row,
  rebuild-cleanup candidate), recommend against extraction, let the user decide — they chose port-local + flag.
  **Run 27 — the PATH can lie about OWNERSHIP, not just CRUD-ness.** A page can sit under an admin-settings
  group's route prefix yet edit the *requester's own* record: `program/profile` lives under `/program/*`
  (alongside the admin-only edit/roles) but is the user's own "My Profile" account page — so it has **no admin
  redirect** and is available to **every** role (only Delete is hidden from global_admin). The tell is in the
  FIRST file read: `useAuthGuard({ requireProgram: false })` + the ABSENCE of the `isProgramAdmin`-redirect
  `useEffect` its siblings have. **Don't inherit a sibling group's gating assumption** — read THIS page's
  guard/redirect lines and let them set §7's role rules; the directory grouping is not the authz boundary.
- **Sub-routes of a deferred group land that group's shared chrome — size the dep port to the whole group, and
  check EACH sub-route, not just the first (runs 25–26).** When you build the sub-route layer under a hub, a page
  often drags in small chrome leaf components the landing pages never needed (run 25 `/program/edit`:
  `ui/PageHeader.tsx`→`components/BackButton.tsx`; run 26 `/program/roles`: `ui/LoadingState.tsx`). Port them
  **verbatim now as shared chrome** (the run-19/20 "port whole shared dep" pattern) because the siblings reuse
  them — front-load the cost once; record it as a **D-DEPS** row scoped to the group. The lesson isn't "the FIRST
  sub-route" — each sub-route may bring its own leaf, so **confirm each page's chrome deps against the foundation**
  and **confirm the transitive chain first** (PageHeader→BackButton) so you don't miss a nested leaf. The rest of
  a sub-route run is usually the purest "zero backend work, no feature bump" shape (run 21): the hub's write
  endpoint (`PUT /programs/:id`) + its client fn + any emit all shipped with the owning feature — the sweep
  CONFIRMS the mount, ports nothing. It can go **one purer** (run 26): when a sibling LANDING page already dragged
  in the whole api module, the sweep `diff`s rebuilt-vs-legacy (byte-identical) and ports *only* the chrome leaf +
  the page. It can go **one purer still** (run 27): when every dep is already ported (the consuming page is the
  belated consumer of api fns ported "vestigial-here" with an earlier sibling — run-22's members fns), record
  D-DEPS as **"no new dependency"** and the sweep ports *nothing but the page itself*. And **a tokenize-the-colors
  cleanup needs a CLEAN token mapping or don't offer it — grep the palette FIRST** (run 26: legacy hexes
  `#f59e0b`/`#3b82f6`/`#6b7280` mapped 1:1 to `rf-warning`/`rf-info`/`rf-text-muted`, admin pixel-identical in
  light mode); no matching token = inventing one = scope creep. **Tokenize SELECTIVELY within a page** (run 27):
  one page had a success line `text-emerald-600` → clean `rf-success` (offered+taken) AND an avatar chip
  `bg-amber-100 text-amber-600` → no rf equivalent (kept faithful+flagged) — grep the palette per-site, a page
  can be partly-tokenizable. A foreground that must
  stay dark on a light accent (dark ink on amber) has no theme-flipping token → keep the literal ink, tokenize
  only the background/border (what flips). And **a
  settings/editor page whose whole job is to SET `admin_only_data_entry` makes that flag N/A as a GATE** — it's
  the value being edited, not a lock on the editor; say so explicitly in §7 (the inverse of the read-only-page
  "N/A because no write path" answer — here it's "N/A because this IS the write path for the flag itself").
  Role rules otherwise fully code-answered by an admin-only `useEffect` redirect + the backend 403 → state §7,
  don't ask. **"Faithful + cleanups" with no named target → still run the run-6/14/22 pinning multiSelect**
  (run 25 took all 3: additive client-side validation the legacy lacked, server-truth hydration over optimistic
  form state — the run-11 client-vs-server call resolved toward the canonical row, and skip-redundant-write);
  none touch the wire contract → no feature bump.
  **Run 28 — a page can be a "near-twin" of TWO already-built pages from DIFFERENT families at once; recognize
  both to cut the run to confirm-only.** `program/password` was the FORM-twin of the public/auth `reset-password`
  page (same new+confirm+5-rule-checklist) AND the DECISION-twin of its sibling sub-route `profile` (same
  D-SCOPE landing-only / D-DEPS no-new-dep / tokenize + clear-stale cleanups). The form-twin settles the UI port;
  the decision-twin settles §9 — neither needs re-derivation (run-23's twin-recognition, now spanning families).
  State the ONE structural difference that makes them twins-not-clones honestly (here: `reset-password`
  authorizes via a URL-fragment recovery token, `password` via the live session bearer — same form, different
  token source). Three corollaries: **(a)** the run-27 selective-tokenize has an inverse — when the per-site
  palette grep comes back ALL-clean (run 28: `text-emerald-600` at 6 sites — 5 checklist rows + the success line
  — all map to `rf-success`, no amber holdout), tokenize everything; the discipline (grep per-site) is constant,
  the result varies. **(b)** the run-20 `useAuthGuard`-reuse generalizes to ANY page still carrying a legacy
  inline `useAuth` + manual redirect `useEffect` that predates the foundation hook — swap it for the exact
  sibling call (`useAuthGuard({ requireProgram: false })`), which does the same redirect AND returns
  `program`/`token`, deleting the boilerplate; confirm the params fit (a password form needs no active program).
  **(c)** a page with NO role-conditional UI at all (byte-identical form for every role; backend only ever
  touches `req.user.id`) makes the role-rules question fully code-answered — §7 is a "same for everyone" table +
  the `admin_only_data_entry`-N/A note, and you skip the role question (run-4b: if the answer wouldn't change the
  SPEC, drop it). The ABSENCE of role-conditional UI is itself the finding.
  **Run 29 — the PUREST page shape: client-only, no backend / no API / no dep at all.** A pure client-preference
  page (`program/appearance` — theme picker writing only `localStorage`) has the "no feature bump, sweep confirms
  the mount" pattern at its FLOOR: there is NO endpoint to confirm AND no dependency to drag in (every import
  already ported, not even a chrome leaf). State it explicitly — Data/API = "none"; D-DEPS = "no new dependency";
  the sweep reads the one page file + confirms imports exist. Two corollaries: **(a)** the tokenize-cleanup
  spectrum bottoms out — runs 26→27→28→29 go clean-mapping → selective-per-site → all-clean → **nothing to
  tokenize** (legacy already fully `rf-*`); the per-site palette grep is constant, the outcome can be zero, so
  don't manufacture a tokenize cleanup on an already-tokenized page. **(b)** the `useAuthGuard`-reuse (run-20/28)
  generalizes to the inline `useAuth` + `useActiveProgram` + redirect TRIPLE — the hook also returns `program`,
  so one swap subsumes the redirect AND a separate `useActiveProgram` back-href call, deleting three imports.
  **Run 30 — the purest-shape spectrum bottoms out at a fully-STATIC content page.** Runs 27→29 traced no-new-dep
  → no-backend/API → client-only (just `localStorage`); `program/privacy` (a static Privacy Policy document) goes
  one further: NO state, NO `localStorage`, NO storage of any kind — it reads nothing and writes nothing; the only
  "state" is the `useAuthGuard` session check. §6 Data/API = "none, not even client storage"; §8 has exactly ONE
  render (no loading/empty/error/pending) — state the floor explicitly, don't invent sections that can't occur.
  Corollary: **keep a shared cross-surface legal/policy document VERBATIM; flag the surface mismatch as an F-row,
  don't fork it.** The web privacy page intentionally describes iOS push/APNs behavior though web uses SSE and
  registers no token — trimming the web-irrelevant clauses forks one shared legal doc into two (content
  governance, not a code cleanup). Lead with "keep verbatim" (taken); record the mismatch + the hardcoded
  effective-date/contact-email as faithful F-rows (a CMS/config-sourced policy is a rebuild feature). And a
  sub-route run can CLOSE its group — when it's the Nth-of-N, say so in D-SCOPE (the `/program/*` layer is now 6/6).
- **Run 31 — a LANDING/sibling run's forward-inference about a deferred sub-route can be WRONG; the sub-route
  run is where it's corrected, as an F-row not a question.** Run-23's lifestyle landing guessed `/lifestyle/workouts`
  was "the write path where `admin_only_data_entry` bites"; reading the actual file proved it's admin-ROLE gated
  (`canManage`) and never references the lock (the lock gates *logging* on `/summary`, not the workout-type
  vocabulary). A landing file genuinely can't see its sub-route's gate — so treat any "the deferred sub-route does
  X" note as a hypothesis to verify against the real file, and when wrong, let the SPEC (an F-row) supersede the
  guess. Two more run-31 patterns: **(a) non-admin handling splits into REDIRECT vs read-only DEGRADE — read THIS
  page's guard to tell which, don't inherit a sibling's.** `program/edit`/`program/roles` bounce non-admins via an
  admin-redirect `useEffect`; `/lifestyle/workouts` renders for everyone and hides controls + the Hidden section
  via a `canManage` flag (the landing's "View workouts" pill routes non-admins here on purpose). The tell is the
  presence/absence of the redirect `useEffect` — the run-27 "path can lie about ownership" axis, applied to
  redirect-vs-degrade. **(b) `window.confirm` is a native primitive the rebuild replaced everywhere — porting it
  verbatim would be the lone divergence; swap it for the ported `ConfirmDialog`** (a `deleteTarget` state +
  danger/loading dialog, mirroring `program/profile`'s delete). When the legacy uses a browser-native dialog the
  rebuild has a component for, "faithful" = match the rebuild's established pattern, not the native call. And the
  purest-shape spectrum (runs 27→29→30) recurs on a WRITE page: `/lifestyle/workouts` is a full CRUD admin screen
  yet still "no new dependency" because the api module landed vestigial-here with an earlier sibling (run 21) and
  every chrome leaf with the `/program/*` sub-routes — D-DEPS = no-new-dep is about whether the deps are already
  ported, not how stateful the page is.
- **Run 32 — dep-purity and faithful-vs-change are INDEPENDENT axes; a near-zero-dep page can still be a
  deliberate CHANGE-NOW run.** `/lifestyle/timeline` closed the `/lifestyle` group as the purest detail page (1
  page file + 1 verbatim chrome leaf `PeriodSelector.tsx`; `fetchHealthTimeline` + the backend route already
  shipped) — yet the user took a change-now stance with 3 cleanups. Don't assume a pure-DEPS page is also a
  pure-faithful port; ask the stance regardless. Three corollaries: **(a) a "change now" option that names a
  cleanup only as an EXAMPLE ("e.g. …") has NOT committed it — run the pinning multiSelect** (run-6/14/25
  protocol) to lock the exact set; the run-25 "stance option names the cleanup → skip pinning" applies only when
  the option commits to a *specific* change. **(b) a faithful chart port can fix a latent VISUAL bug as the
  cleanup** — mixed-unit series on one shared Y-axis (sleep-hours ≈0–12 vs diet-quality 1–5 flattened the diet
  line); the fix is a dual Y-axis (one scale per unit) + `<Legend>` + unit labels, the chart analogue of run-11's
  TZ cleanup (faithful data, clearer presentation). When series share an axis but not a unit, surface it. **(c) a
  detail sub-route with NO view-as picker takes its data scope purely from the URL param the LANDING passes**
  (`resolvedMemberId`: URL `memberId` → that; else admin → program-wide; else own id) — the landing owns member
  selection; an admin landing here directly sees program-wide. The tell (run-27/31 axis): absence of both a picker
  AND an admin-redirect `useEffect`. And it CLOSES the group (run-30 corollary): flip COVERAGE `[~]`→`[x]`, say so
  in D-SCOPE + PROGRESS.
- **Run 33 — a near-twin chart drill-down can be SIMPLER than its twin; copy the decision shape, then SUBTRACT the
  twin-specific cleanups.** `summary/activity` (first `/summary` sub-route) reused `lifestyle/timeline`'s shape
  (purest deps — no new dependency; faithful + chart cleanups) but is **program-wide** (no view-as picker, no
  `memberId`, no role logic at all — the run-22/32 read-only-dashboard axis) and **same-unit** (both series are
  counts). So the run-32 **dual-Y-axis cleanup is declined** — a second axis is correct only when series share an
  axis but NOT a unit (timeline: sleep-hrs vs diet-1–5); same-unit series belong on one shared axis. Don't
  reflexively port a twin's cleanup list — re-test EACH against THIS page (run-26's "don't offer a cleanup without a
  clean basis", now applied to a twin's cleanups). The unit-agnostic clarity cleanups DO transfer (`<Legend>` +
  series names so color-only-distinguished bars are labeled; the empty-state guard); the unit-specific one
  (dual-axis) does not. Recognize the twin to go fast, then subtract what doesn't apply. **Run 34 extended this: a
  twin cleanup that DOES transfer may still need its PREDICATE re-derived for THIS page's data shape — copying it
  verbatim can be a no-op-then-bug.** `summary/distribution` (2nd `/summary` sub-route, purer than `activity` — no
  `PeriodSelector`, no `useState`) reused `activity`'s empty-state guard, but `activity`'s `buckets.length === 0`
  never fires here because the distribution endpoint **always returns all 7 weekday keys** — so the guard had to key
  off the **sum** (`data.every(d => d.value === 0)`) instead. The cleanup's INTENT carries; its CONDITION must be
  re-checked against the endpoint's response shape (grep the service's return value). And the run-33 subtraction
  recurs: distribution's **single** bar series killed the `<Legend>`+series-names cleanup (nothing to disambiguate)
  AND the dual-axis (one natural axis). A near-twin can be simpler than its already-simplified twin. **Run 35
  closed the loop: the run-34 predicate re-check can come back CLEAN — re-derive every time, but don't manufacture
  a predicate change when the legacy one already fits.** `summary/workout-types` (3rd `/summary` sub-route, LAST
  chart drill-down, near-twin of `distribution`) dutifully re-checked its empty-state guard and found the legacy
  `data.length === 0` is *already correct* — `getWorkoutTypes` returns a **variable-length array** (`[]` when
  empty), so an empty array IS the empty case (unlike distribution's always-7-keys, where `data.length` never
  fires). So the cleanup was STYLING only (match distribution's `rf-surface-muted` panel), NOT the predicate. The
  discipline (re-derive the predicate against THIS endpoint's response shape) is the constant; the OUTCOME varies —
  sometimes it already fits. `<Legend>`/dual-axis stayed subtracted (single counts series). Corollary: **when two
  pages share a React Query key but pass different fetch args (the landing's `limit=50` vs the detail's `limit=100`
  under `["summary","workoutTypes",programId]`), flag the dedupe-to-one-cache-entry** as a faithful-kept oddity
  (React Query dedupes by key, not by `queryFn` args).
- **Run 36 — a modal already built on a landing becomes a standalone PAGE for free via the shared form's
  pre-existing `variant` branch; a WRITE page can still be "no new dependency."** When an earlier landing run ported
  a shared form with a dead `variant="page"` branch and flagged it as an F-row (summary F6), the sub-route run that
  lights it up is the belated consumer: the sweep ports ONLY the page wrapper (`PageShell`/`PageHeader` + `<Form
  variant="page" …/>`), nothing else — run-31's no-new-dep-on-a-stateful-page at its cleanest (the page body is one
  component). Three corollaries: **(a) within ONE sub-route group `admin_only_data_entry` splits read-vs-write —
  decide it per page, don't inherit the group's answer.** The 3 `/summary` chart drill-downs were read-only → lock
  N/A (runs 33–35); the log fallbacks are the WRITE path → the lock is LIVE (client mount `router.replace("/summary")`
  for locked non-admins + the backend `requireDataEntryAllowed` 403). §7's lock line is set by whether the page
  *writes*, not by its directory group — the inverse of the read-only N/A finding. **(b) a "considered cleanup" can
  be REJECTED once grounded — verify the reuse target's definition + export before offering "reuse X".** "Reuse
  `refreshSummaryQueries` over raw `invalidateQueries(["summary"])`" dissolved: that helper is a module-PRIVATE
  one-liner (`summary/page.tsx:310`), byte-identical to the faithful inline call and not importable — nothing to
  reuse. Grep the helper before presenting the cleanup; record the rejection in a §9 "not a cleanup" note so it
  isn't re-raised. **(c) deterministic-nav cleanup — when a page uses `router.back()` but a sibling control already
  hardcodes the destination, swap to `router.push(<fixed>)` for consistency + to kill the direct-nav/refresh
  footgun** (here the header BackButton already used `/summary`; post-save + form-close now match it; the lock
  `router.replace` stays — replace intentionally drops the locked page from history). And the genuinely-open
  decision count was ONE (scope fact-determined) → a single `AskUserQuestion` for stance + the one cleanup; don't
  manufacture a scope question the user's page-pick already settled.
- **Run 37 — a NEAR-EXACT twin run is confirm-only: recognize the twin, transcribe its decision shape, enumerate
  only the deltas.** `summary/log-health` was structurally identical to the just-built `summary/log-workout` (run
  36) — same `PageShell`+`PageHeader`+`<Form variant="page">` wrapper, same `canLogForAny` role logic, same
  `admin_only_data_entry` `router.replace` lock guard, same `invalidateQueries(["summary"])` mutation, same D-C1
  nav cleanup. So the run collapsed to a 3-file read (legacy page · the rebuilt form · the sibling rebuilt page) +
  a consumption confirm (api fn ported, route mounted+gated, landing routes mobile→here), a SINGLE stance
  `AskUserQuestion`, and a SPEC that mirrors the sibling §-by-§. Don't re-derive D-SCOPE/D-REF/D-DEPS/D-S1/D-C1 —
  copy them; the only authored content is the DELTAS (here: the health form instead of the workout form; one fewer
  lookup — member only, no workout-types; one extra F-row for the client-only at-least-one-metric submit gate;
  different title/subtitle). Twin-recognition (runs 23/28/33) extended to the purest case — a write page where even
  the cleanups transfer verbatim, so the run is transcribe-plus-delta.
- **Run 38 — a near-exact twin can carry ONE genuinely-new but still CODE-DETERMINED behavioral shape; recognize the
  twin, then the new shape lands as an F-row + a D-S1 line, NOT a question.** `summary/bulk-log-workout` (6th & LAST
  `/summary` sub-route — CLOSES the group; 3rd & final log fallback) was a near-exact twin of runs 36/37 (same
  `PageShell`/`PageHeader`/`<Form variant="page">` wrapper, same `canLogForAny`, same `admin_only_data_entry`
  `router.replace` lock guard, same `invalidateQueries(["summary"])`, same D-C1 nav cleanup) — yet it differs in a
  real way: a **two-way mount redirect** (lock → `/summary` AND `!canLogForAny` → `/summary/log-workout`, the bulk-only
  member-bounce, since bulk-logging is admin/logger-only; backend `logService.js:191-192` is the real 403). The
  twin-collapse (run 37) holds even when the twin isn't byte-identical: the DECISION shape
  (D-SCOPE/D-REF/D-DEPS/D-S1/D-C1) still transcribes verbatim; only the §7/§10 prose absorbs the new shape. Don't
  mistake a new code-determined behavior for a new open decision — if reading the file answers it (the redirect target,
  the per-row `ApiError.details → BulkRowError[]` plumbing, the absence of `canSelectAnyMember`/`userId` on the bulk
  form because every reachable role is `canLogForAny`), it's an F-row, not an `AskUserQuestion`. The genuinely-open
  count stayed ONE (stance + D-C1), a single call. And a sub-route run can CLOSE its group (run 30/32 corollary):
  flip COVERAGE `[~]`→`[x]`, say so in D-SCOPE + PROGRESS — the `/summary` layer is now 6/6.
- **Run 39 — a sub-route's CORE dependency can live in a DIFFERENT feature family's already-ported module — grep the
  legacy file's actual import paths before sizing deps.** `members/list` (1st of the 8 `/members` sub-routes) imported
  `fetchMembershipDetails`/`MembershipDetail` from `@/lib/api/programs` — ported with the `program` landing run 24 /
  `program/roles` run 26 (already consumed by 2 live pages), **not** from the members landing's `lib/api/members.ts`
  (run 22). So "no new dependency" held even though the *members landing never touched this fn*. Don't assume a
  sub-route's deps come from its OWN family's landing-run port — the import path is the source of truth; the run-19/20
  "page drags in shared deps" pattern includes deps already landed by an unrelated sibling. The rest was the purest
  no-new-dep read page (runs 27/29/31): a 113-line confirm-style port, genuinely-open count = ONE (stance + one
  tokenize cleanup — the "Inactive" badge `bg-red-100 text-red-600` → `bg-rf-danger/10 text-rf-danger`, the run-27/28
  selective-tokenize with exactly one untokenizable site). Role rules fully code-answered: no admin redirect, every
  role sees the same roster, only `isGlobalAdmin` gets clickable rows → the deferred `/members/detail`;
  `admin_only_data_entry` N/A (read-only — run 22/33). And the inverse of run 30/32/38's "closes the group": a run can
  OPEN a group — say "1st of N, does not close" in D-SCOPE. Two faithful F-rows worth noting: an **entry-path
  asymmetry** (the landing's "View Members" pill shows for `!canViewAs` loggers/members, yet only global_admin can act
  on a row — so the pill-reachers see a purely informational list) and the **`status` (membership) vs `is_active`
  (account)** distinction (the list filters by one boolean, badges by the other).
- **Run 40 — `members/detail` (the write twin of run-39's read page): the run-39 cross-family-dep lesson is sized
  PER-FUNCTION, the nav-cleanup is CONDITIONAL, and a client gate can be STRICTER than the backend.** Three durable
  patterns. **(a)** Run 39 found a sub-route's *read* fn (`fetchMembershipDetails`) in a different family's module
  (`lib/api/programs.ts`, not the members family's `lib/api/members.ts`); run 40 — the editor that page links to —
  took the *write* fns (`updateMembership`/`removeMembership`) from the **same** `programs.ts`. So "no new dependency"
  is settled by the **import path per-function**, not per-family: two sibling pages of one family can draw different
  fns from one unrelated module while never touching their own family's api file. Grep each import's actual path. **(b)
  The deterministic-nav cleanup (runs 36–38) is CONDITIONAL — check the legacy nav calls first.** Runs 36–38 swapped
  `router.back()` → `router.push(<fixed>)`; run 40's legacy ALREADY used `router.push("/members/list")` on both
  success paths, so there was **nothing to clean** — don't offer (or invent) a nav cleanup that's already satisfied.
  **(c) A CLIENT gate can be STRICTER than the backend — that's a faithful F-row, the inverse of the usual worry.**
  `members/detail` redirects every non-global_admin on mount, but the service `updateMembership`/`removeMember` also
  authorize a **program admin** of the target program (`membershipService.js:181-193`, `:304-311`). The stricter
  client gate is kept (faithful); the backend is the real authorization boundary. We usually flag "client laxer than
  backend" (a display-only JWT decode the server re-verifies); this is the mirror — flag it, keep both. And the lock:
  `admin_only_data_entry` is **N/A** on a membership editor (it edits join-date/active-flag/removal, not workout/health
  data entry — the run-31/36 read-vs-write-lock axis says the lock follows whether the page does *logging*, not
  whether it writes at all).
- **Run 41 — `members/invite` (the invite-by-username form): the cross-family-dep lesson is sized per-FUNCTION (the
  page's OWN family is just as valid a source), and a load-bearing characteristic can be a deliberate error-swallow
  for privacy — keep faithful, flag, never offer as a "fix".** Two durable patterns. **(a)** Runs 39/40 found a
  sub-route's deps in a *different* feature family's module (`lib/api/programs.ts`, not the members family's
  `members.ts`); run 41's `sendProgramInvite` lives in the page's **own** members family (`members.ts:204`, ported
  vestigial-here with the `/members` landing run 22). The conclusion is identical — **grep each import's actual path,
  size "no new dep" per-function** — but don't over-fit run-39/40 into "the dep always comes from elsewhere"; the
  own-family module is the equally-common case. **(b) A faithful port's load-bearing characteristic can be a
  deliberate error-swallow for privacy.** `members/invite`'s catch surfaces an error ONLY when the message contains
  "network"; **every other failure** (username not found / already invited / blocked / a 403) is silently rendered as
  "Invitation sent." with the field cleared — so the page never confirms whether a username exists (the visible
  info-banner corroborates the intent). Recognize it as intent, keep it faithful, flag it as an F-row, and **never
  offer it as a cleanup** — surfacing the real error would be the privacy regression. (Corollary, already known: the
  nav-cleanup stayed un-offered — the page **stays put** after a send, showing the success box in place, so there's
  no `router.back()`/`router.push` to make deterministic; run-40's "check the legacy nav calls first" generalizes to
  "a page that doesn't navigate has no nav cleanup".)
- **Run 42 — `members/metrics` (the program-wide metrics dashboard): the entry-path asymmetry can INVERT, and the
  tokenize spectrum's full-tokenize end is a legit user pick even where a prior run kept faithful.** Two durable
  patterns. **(a) The run-39 entry-path asymmetry inverts.** Run-39's `members/list` had a landing pill LAXER than
  the action (the "View Members" pill showed for roles that then couldn't act on a row). Run-42's `members/metrics`
  is the mirror: the only link to the page is the landing's metrics card gated `{isProgramAdmin && …}`
  (`members/page.tsx:281`), yet the page has **no role gate** (`useAuthGuard()` default, no redirect, no
  role-conditional UI) and the backend `getMemberMetrics` enforces only `ensureProgramAccess` — so the entry-link is
  **STRICTER** than the page/backend (any active member who navigates directly gets the full program-wide
  leaderboard). Either direction is a faithful F-row — flag the mismatch, name the real boundary (the backend
  service), keep both; don't "fix" the page to match the link. (Corollary, the secure characteristic: member-analytics
  routes carry `authenticateToken` at the router but enforce `ensureProgramAccess` in the SERVICE — unlike the
  `/summary` analytics' route-only `authenticateToken` (run-13 F2); grep the SERVICE, not just the route, for the
  per-program read gate.) **(b) The tokenize-cleanup spectrum's FULL-tokenize end is the user's to pick, even against
  a prior keep-faithful precedent.** Run-27 kept an amber chip faithful (dark-ink-on-light-amber has no clean
  theme-flipping token); run-42's identical-shape amber flame badge (`bg-amber-200/70 text-amber-900`) was
  **full-tokenized** to `bg-rf-warning/20 text-rf-warning` because `rf-warning` exists and the user owns the bg/ink
  contrast trade-off. Offer all three — keep-faithful (lead, cite the precedent), bg-only (theme-aware bg, kept ink,
  flag the dark-mode contrast risk), full-tokenize (fully theme-aware, changes the look) — and don't pre-decide; the
  recommendation can lose. The per-site palette grep (runs 26→27→28→29) is the constant; the *outcome* spans
  keep-faithful → selective → all-clean → full-tokenize and is a real fork, not a mechanical default.
- **Run 43 — `members/history` (the per-member workout-history timeline): a near-twin can differ from BOTH its twins by
  ONE structural feature → recognize the twins, then ADD the one delta — the mirror of run-33's SUBTRACT.** The page
  reused `summary/activity`'s (run 33) `PeriodSelector` + single-series workouts `BarChart` AND `lifestyle/timeline`'s
  (run 32) per-member URL-`memberId`/`name` scope — yet it carries a **role-redirect neither twin had** (`canViewAny =
  global_admin || admin || logger`; a plain member viewing another member's `memberId` is `router.push("/members")`'d —
  run-32 `lifestyle/timeline` explicitly had NO redirect, run-33 `summary/activity` was program-wide with no role logic
  at all). So twin-collapse (runs 23/28/33/37/38) runs BOTH directions: **subtract** the simpler twin's cleanups that
  don't apply (run-33: `<Legend>`/dual-axis killed by the single counts series) AND **add** the one structural feature
  the richer page introduces, landing it as a D-S1 line + an F-row, not an open question (reading the file answers it).
  Two reinforced corollaries: **(a)** the redirect is a fresh instance of the run-40 **client-stricter-than-backend**
  F-row — the page bounces a non-staff user from another member's history, but `getMemberHistory` only enforces
  `ensureProgramAccess` + target-enrolled (any active member could fetch any enrolled member's history via the API
  directly); flag the asymmetry, name the looser backend as the real boundary, keep both. **(b)** the run-34
  predicate-vs-shape re-derive recurs and MUST be done even on a twin's transferred cleanup: `summary/activity`'s
  empty-state guard transferred in INTENT, but its CONDITION had to be re-keyed off the **sum** (`buckets.some(b =>
  b.workouts > 0)`), not `buckets.length`, because `getMemberHistory` always returns a full window of buckets so
  `length` is never 0 — copying the twin's `length===0` verbatim would have been a silent no-op.
- **Run 45 — `members/workouts` (the only WRITE sub-route in an otherwise read-only group): "no new dependency" can hold
  across THREE families' modules at once, and the cleanups can be a UNION transferred from several distinct prior runs.**
  The page's api fns came from `lib/api/members.ts` (run 22) + `program-workouts.ts` + `logs.ts` (run 21) — three
  different feature families — yet every fn was already landed by some earlier sibling, so the sweep still ported only
  the page file. Run 39/40/41 sized "no new dep" per-FUNCTION (the import path is the source of truth, not the family);
  run 45 is the extreme — grep EACH import's actual path, don't tally by family. **Corollary: pin the cleanup UNION in
  one multiSelect when a page's surface spans patterns several siblings each solved once** — D-C1 `window.confirm`→
  `ConfirmDialog` (run 31), D-C2 reuse hoisted `formatDuration` (run 22), D-C3 tokenize the Delete button → `rf-danger`
  (run 39); each cites its own precedent run, no re-derivation. And the read-vs-write-lock axis (runs 31/36/40) decides
  `admin_only_data_entry` PER PAGE within a group: four read-only members sub-routes had the lock N/A, this WRITE page
  has it LIVE (gating `canEdit`/`canDelete`); the lock follows whether the page *mutates*, not its directory group. The
  "no list-query error state" (only mutation errors surface) is a faithful F-row — a write page need not mirror its read
  twins' `ErrorState`.
- **Run 46 — `members/health` (the WRITE twin of `members/workouts` run 45, CLOSES the `/members` group 8/8): a twin run
  SUBTRACTS one of the twin's cleanups when its PRECONDITION is absent — at the DEPS level that means "already shared,
  nothing to hoist".** Workouts took D-C2 = "reuse the hoisted `formatDuration`" because its label helper was
  page-local-then-hoisted; `members/health`'s label helpers (`sleepLabel`/`dietLabel`) are **already shared in
  `lib/format.ts`** (the legacy already imports them from there), so there is **no hoist cleanup** — the twin's 3 cleanups
  collapse to 2 (D-C1 `window.confirm`→`ConfirmDialog`, D-C2 tokenize Delete → `rf-danger`, each still citing run 45/31 /
  45/39). This is the DEPS-level mirror of run-33's "subtract a twin's chart cleanup that doesn't apply" + run-34's
  predicate re-derive: re-test EACH of the twin's cleanups against THIS page's actual code, drop the one whose
  precondition is gone. **Corollary — don't manufacture a hoist; keep genuinely page-specific helpers verbatim**
  (`members/health`'s `formatSleepHoursForFilter`/`splitSleepHours` have no shared equivalent → ported, not hoisted) —
  the dual of run-22's hoist offer ("reuse the shared copy" applies only when a shared copy exists). And the
  **launch-prompt hypothesis is superseded by the first file-read** (run-22 "verify the landing yourself"): the prompt
  guessed health was the chart-twin of `members/history`, but reading the file proved it the manager-twin of
  `members/workouts` — record the correction as the run's first finding, don't carry the guess forward. Reconfirmed (not
  re-promoted): no-new-dep per-FUNCTION across families (run 39/40/41/45); read-vs-write-lock LIVE because the page WRITES
  (run 31/36/40/45); client-stricter-than-backend faithful F-row (run 40/43/45); at-least-one-metric guard (log-health
  run-37 mirror); a run CLOSING its group (run 30/32/38 — flip COVERAGE to "COMPLETE (8/8)", say so in D-SCOPE/PROGRESS).
- **Run 47 — `privacy-policy` + `support` (the public legal/contact pair; CLOSES the ENTIRE WEB SURFACE): a PUBLIC page
  is a static page MINUS the auth guard, two cross-linked trivial pages are ONE run, and single-sourcing byte-identical
  content across two ROUTES is the user's call.** Three durable patterns. **(a) The purest-shape spectrum has a PUBLIC
  floor BELOW run-30's static page.** Runs 27→29→30 traced no-new-dep → no-backend/API → fully-static-with-`useAuthGuard`;
  a PUBLIC static page (`privacy-policy`/`support`) drops even the `useAuthGuard` — no session check, no redirect, no
  `program` back-href. **The `middleware.ts` MATCHER, not the page body, decides public-vs-gated — grep the matcher to
  classify a route** (here it covers only `/summary`/`/members`/`/lifestyle`/`/program`/`/programs`, so the two pages are
  pre-auth). When a public page is the twin of an auth-gated one (`privacy-policy` is the public twin of `program/privacy`,
  byte-identical body), the ONE structural difference is the absence of the guard (+ the header action swaps Back → a
  cross-link), so the gated twin's "reuse `useAuthGuard`" D-C has **no analogue** — don't manufacture a guard cleanup on a
  guard-less page. Role rules = **N/A (pre-auth)**, stated explicitly (the splash/login answer, runs 15–16), never omitted.
  **(b) A run can CLOSE the entire SURFACE, not just a group — and two cross-linked trivial pages are legitimately ONE
  run.** The "closes the group" lesson (run 30/32/38/46) scales up: when the last two legacy routes are a cross-linked
  pair of trivial statics, do both in one run/commit and say "CLOSES the web surface" in D-SCOPE + PROGRESS + COVERAGE —
  and **verify it with a route-tree diff** (`find legacy -name page.tsx` vs `find ours`), the proof the surface is
  complete, not just the COVERAGE checklist. **(c) Single-sourcing byte-identical content across two ROUTES is the user's
  decision, and run-30's "keep the shared legal doc verbatim, don't fork/couple" applies to web↔web duplication too.**
  `/privacy-policy`'s body is byte-identical to `program/privacy`, but the two are **distinct access tiers** (public legal
  URL vs in-app settings) — extracting a shared `<PrivacyPolicyContent>` would touch an already-committed page AND couple
  two tiers a future divergence (different effective date, public-only clauses) would re-split. Lead with
  **faithful-duplicate + flag** (an F-row / rebuild-cleanup candidate), offer single-source with its coupling cost named;
  the user owns the DRY-vs-decoupling trade-off. Run-30 was "don't TRIM a shared doc to fit one surface"; run-47 is the
  symmetric "don't MERGE two shared copies into one component" — same principle, a shared legal/policy doc stays
  verbatim-per-route, coupling it is content governance, not a code cleanup.
- **Run 48 — the web `notifications` CLIENT port (replaces the `NotificationsGate` deferred stub): a client port that
  replaces a deferred stub is the MIRROR of the keystone backend run, the SPEC already documents it (realize, don't
  re-spec), and a legacy client's cross-layer assumptions must be re-checked against the DIVERGED rebuild.** Three durable
  patterns. **(a)** Run 5 ported the backend keystone that REPLACED the `utils/notifications.js` stub; run 48 is the
  symmetric CLIENT move — replace the web `NotificationsGate` `return null` stub, the live SSE/alert path lights up. The
  feature SPEC's `D-REF` (written at backend-port time) **already described the web `EventSource`+`NotificationModal`
  queue**, so the run **realizes the spec**: SPEC churn is additive only (new `D-C`/`F` rows + a changelog row + a MINOR
  bump; §1–§8 untouched) — the implementation analog of run-14's "the spec already documents it". Don't re-spec a feature
  whose client the SPEC anticipated. **(b) A legacy client's cross-layer assumptions (React-Query invalidation keys, route
  guard lists) must be re-checked against the rebuild that DIVERGED from legacy — port verbatim where they still LAND,
  reconcile the few that drifted.** Grepping the rebuilt query layer showed it preserved almost every legacy invalidation
  key shape → port verbatim, they land (run-35 "re-derive, the legacy fits" extended from empty-state predicates to
  invalidation keys); the LONE drifted key (`["program","roles",…]` matched no rebuilt query) was **dropped** (D-C7 — the
  broad `["program"]` invalidation covers it). The mirror: the legacy `isAuthRoute` guard list predated the rebuild's 2
  net-new public auth routes → **add them** (D-C6, the run-19 "reconcile the rebuilt route set" generalized to a guard's
  list). Both reconciles are deliberate D-row divergences, not faithful-literal — grep the rebuilt consumer of each
  cross-layer reference before porting it. **(c) A feature-client port can be "no new dependency" even when the component
  is stateful + opens a live connection** — the gate drags in nothing (every import already ported: `fetchPrograms`,
  `lib/storage`, `broadcastActiveProgramUpdate`, `useAuth`); D-DEPS is about whether the deps are already ported, not how
  stateful the component is (run-31). And the modal was already `rf-*` tokenized → no tokenize cleanup; the gate doesn't
  navigate → no nav cleanup. `consumed_by` subtlety: the SPEC may already list the client (declared at backend-port time
  from the legacy sweep) before it's actually wired — the run makes the declared consumption real; the MINOR bump is
  justified by "the client lands + new D/F rows", not by a `consumed_by` edit.
- **Run 51 — the FIRST screen on a surface whose SIBLING surface is already built: the lead stance flips from
  faithful-legacy to MATCH-THE-BUILT-SIBLING, and the sibling's flagged cross-app F-rows are this run's work-list.**
  Every prior run had ONE reference (the legacy app). The iOS auth screens (`splash`/`login`/`create-account`) are the
  first ported AFTER their web twins shipped — so the **current web app is a co-equal reference point** (user steer,
  memory `ios-matches-web-not-just-legacy`). This INVERTS the default: lead with **"match the current built web app"**,
  not "faithful 1:1 to legacy iOS". The web page SPECs' F-rows that say "web-first, iOS gap to reconcile at the iOS
  port" (splash F3 placeholder icon, login F3 missing recovery link, create-account F6 missing cleanups) are
  **pre-identified DECISIONS** — read the sibling SPEC first, and each such F-row becomes a candidate D-row for the
  matching screen (the cross-CLIENT generalization of within-surface twin-recognition, runs 23/28/33 — the "twin" is
  the same screen on the other client, and the lead flips to match it). Four corollaries. **(a) A sibling deviation has
  THREE possible outcomes, not two — transfer, subtract, or N/A-by-architecture.** Web create-account's authed→redirect
  cleanup (web D-C2) is **N/A on iOS** because `AppRootView` already bifurcates on `authToken` at the root (an authed
  user never reaches the screen) — record it as an explicit D-C-note so the SPEC shows it was considered, not missed
  (the cross-client mirror of run-33's "subtract a cleanup that doesn't apply"). **(b) "Match the sibling" is scoped to
  BEHAVIOR/PARITY, not pixel-identical layout** — the real brand icon (parity) transferred, but the icon SIZE stayed at
  the iOS layout value (kept faithful + flagged), the same call the web SPECs made for the cosmetic type-speed
  divergence. Distinguish the substantive parity item from platform-tuned cosmetics; match the former, keep the latter
  faithful. **(c) A cross-client capability whose TERMINAL step is owned by the other client opens the browser, not a
  native rebuild** — iOS "Forgot your password?" leads with "open the live web flow" (`APIConfig.forgotPasswordURL`)
  because the reset always completes in-browser regardless of client (Supabase emails a link to the web reset page);
  a native request screen would still hand off to the browser, so the lowest-scope faithful-to-web option wins. Offer
  the native rebuild as the heavier alternative. **(d) Dep-purity recurs at the foundation boundary (run-31/48,
  cross-platform)** — all three screens were "no new dependency" because every component landed in the foundation
  (run 50); the ONE new dep (a `BrandMark` component + brand asset) was the web-parity ADDITION, not a legacy-port gap.
  The iOS analogue of "grep the import paths" is a dedicated Explore agent over the ported foundation — confirm each
  screen's deps exist before sizing the run. (Mechanics: folder-synchronized Xcode groups → new files auto-include, no
  `pbxproj` edit; build green-check is the user's, memory `ios-user-verifies-builds-visually` — verify symbols via grep,
  not a CLI build. Role rules N/A pre-auth, stated explicitly.)
- **Run 52 — `ProgramPickerView` (the FIRST post-auth iOS screen): a cross-app divergence can be a platform-idiom
  EXCEPTION to web parity (keep the NATIVE idiom), not a gap to reconcile — and a web-parity cleanup can be DISCOVERED by
  behavior-diffing the legacy iOS against web, not just transcribing the web SPEC's flagged F-rows.** Two durable
  patterns. **(a) Distinguish a STRUCTURAL/idiom divergence (lead "keep iOS-native") from a PARITY divergence (lead "match
  web") — opposite leads.** Memory `ios-matches-web-not-just-legacy` ("resolve toward web UNLESS a platform reason") read
  as near-unconditional after run 51 (its 3 divergences all resolved toward web). Run 52 is the first where the LEAD answer
  is the platform-reason exception: the web `/programs` hub renders the whole flow on ONE page (create/edit/invites/account
  as inline modals); the legacy iOS picker uses native multi-screen navigation + sheets (swipe edit/delete, a floating "+"
  → actions sheet, an account sheet). Collapsing to web's single-page layout fights the native idiom AND the legacy
  structure → iOS-native wins, recorded as D-REF + an F-row, NOT a reconcile. Surface the divergence as its own question;
  lead with "keep iOS-native" when it's STRUCTURE/navigation, lead with "match web" only when it's a substantive PARITY
  item (run-51 icon/recovery/validation). **(b) A web-parity cleanup candidate isn't always a pre-flagged web-SPEC F-row —
  it can be a divergence you DISCOVER by diffing the legacy iOS BEHAVIOR against web's during the sweep.** Run-51's
  web-parity items came from web SPEC F-rows ("iOS gap to reconcile"); run-52's D-C1 (the error display) came from READING
  the legacy code — `errorMessage` set in `loadPrograms`/`deleteProgram`/`respondToInvite` but rendered NOWHERE (errors
  silently swallowed) — and noticing the web hub surfaces query errors, a behavioral divergence with no pre-existing web
  F-row. So the sweep includes a behavior-diff ("does iOS DO what web does for the same path?"), and "web surfaces X, iOS
  swallows it" is a candidate web-parity D-C. Implement ADDITIVELY where web's pattern would hide content (web replaces the
  list on a load error; the iOS additive banner keeps mutation errors visible alongside loaded cards). Reconfirmed: the
  scope cut IS the run for a screen that navigates OUT to N unbuilt screens — port the screen verbatim + add
  `ScaffoldPlaceholder` stubs for the N forward-nav targets (run-21/50, now 7 stubs cross-platform); dep-purity confirmed
  by a foundation Explore agent (run-31/48/51); a non-private inline type (`StatusPill`) needs a collision grep before it
  lands; client role gating (`canOpen`/`canManage`) is a faithful F-row (web programs F1 mirror); `admin_only_data_entry`
  N/A (read into context for downstream log screens, never gates the picker).
- **Run 53 — a pure-NAVIGATION SHELL is the purest "scope cut IS the run": a 96-line container, ZERO web-parity
  deviation (the behavior-diff sweep comes back empty), and the D-REF idiom divergence lives at the NAVIGATION-STRUCTURE
  altitude.** Three durable patterns. **(a) Reading the LANDING file distinguishes a SHELL from a page (run-22 axis,
  escalated).** `AdminHomeView` *named* like a dashboard is actually a 96-line bottom `TabView` shell hosting 4 tabs whose
  bodies (8–14 KB each) drag in the whole authed surface (30+ web pages) — so the run is "port the shell, defer the 7 tab
  bodies as stubs", not "port the dashboard". A `*Home`/`*View` name can hide a container; read the file before sizing. The
  stub for a body the shell passes a binding to must carry the matching initializer (`AdminSummaryTab` needs
  `period: Binding<AdminHomeView.Period>` to match the call site; the no-arg bodies don't) — and any nested type the bodies
  reference (`AdminHomeView.Period`) ships WITH the shell so the stubs compile. **(b) A pure-nav screen has NO web-parity
  deviation — the absence is the finding.** Run-52 added an error banner because its behavior-diff caught the legacy
  swallowing errors web surfaces; run-53's shell does NO data fetch, NO error state, NO behavior at all, so the same
  behavior-diff sweep comes back EMPTY → D-S1 is faithful-1:1 with zero D-C rows. Don't manufacture a web-parity cleanup on
  a screen with no behavior to diff; report "pure nav, nothing to reconcile" explicitly. **(c) The run-52 D-REF
  (keep-iOS-native vs match-web) recurs at a HIGHER altitude — the navigation STRUCTURE itself.** Run-52's idiom divergence
  was sheets-vs-inline-modals within one hub; run-53's is the whole app's nav shape: web = 4 top-level routes under a nav
  layout, iOS = one native bottom `TabView`. Same lead ("keep iOS-native" when it's STRUCTURE/idiom, not a PARITY item) —
  and the tell that it's idiom-not-gap is that the tab SET + ORDER already match web (Summary/Members/Lifestyle/Program), so
  only the container shape differs. Reconfirmed: scope-cut-IS-the-run for a shell hosting N deferred bodies (run-21/50/52,
  now stubbing 7 tab bodies); dep-purity by grep (`isProgramAdmin`/`adaptiveTint` foundation symbols + collision-free
  names); `admin_only_data_entry` N/A at a nav shell (a screen that does no data entry has the lock N/A — the read-vs-write
  axis); role rules code-answered by the `@ViewBuilder` Admin*/Standard* switches (stated, not asked).
- **Run 54 — the first TAB BODY (`AdminSummaryTab`, iOS analogue of web `/summary`): a web-parity reconcile can be
  a capability legacy iOS NEVER HAD (a missing feature, not a swallow-vs-surface tweak) sourced from the backend
  payload + web's predicate; the file-pair split recurs at the CARD/DETAIL boundary; and a "faithful" stance means
  REVERTING an over-eager de-dup.** Three durable patterns. **(a) A web-parity ADD can span 3 client layers and
  source its truth from WEB, not legacy iOS.** Run-52's error banner was the swallow-vs-surface shape (iOS computes
  `errorMessage` but hides it). Run-54's D-C2 data-lock is heavier: legacy iOS had **no lock notion at all** (grep
  `Features/Home/` = zero refs; it relied on the backend 403). Adopting it = decode the field the backend already
  returns (`ProgramDTO.admin_only_data_entry`) → add a context flag + computed (`adminOnlyDataEntry`/
  `dataEntryLocked`) → render the UI (🔒 banner + dimmed cards), replicating **web's exact predicate**
  (`flag && !isProgramAdmin`, from `lib/permissions.ts`), NOT inventing one. So when the behavior-diff sweep
  (run-52) finds "web does X, iOS doesn't", X may be a whole missing feature — wire it across DTO→context→UI to
  web's logic, and the SPEC's D-C cites the web permission helper as the source of truth. **(b) The file-pair split
  (run 7) recurs at the CARD/DETAIL boundary, cross-platform.** Legacy bundled each summary `*Card` struct in the
  SAME file as its expanded `*DetailView`; porting the dashboard = take the CARD half into the new files, leave the
  DETAIL half as deferred stubs (the 5 detail views = the iOS analogues of web's `/summary` sub-routes). A generic
  collision-risky helper pulled across (`ChartOverlay`) gets a disambiguating rename (`DistributionChartOverlay`) —
  faithful, non-behavioral (the run-52 `StatusPill` collision-grep, now applied as a rename). **(c) "Faithful" means
  REVERT an over-eager de-dup — keep the dup + flag it.** Mid-port I extracted the 4×-duplicated inline `changeBadge`
  into a shared component; the user picked faithful, NOT change-now, so I reverted to the 4 inline copies + recorded
  an F-row (rebuild-cleanup candidate). The de-dup is a USER-PICKED `D-C` (runs 22/45), never the author's reflex —
  under faithful, port verbatim incl. the dup. Reconfirmed: scope-cut-IS-the-run for N deferred targets (run
  21/50/52/53 — now 5 detail stubs); dep-purity by foundation Explore + grep; `admin_only_data_entry` decided per
  page by read-vs-write (LIVE here — the landing has the log action cards); role rules same-for-all → stated not
  asked; build owned by the user (Xcode), symbols grep-verified (each card/type once, theme/context/DTO resolve,
  5 stubs collision-free).
- **Run 55 — a tab-body port can carry a genuine NEW shared chrome dep even after a no-new-dep streak, and the
  behavior-diff's ADD verdict is set by WHAT WEB DOES, not by whether iOS swallows.** `AdminMembersTab`/
  `StandardMembersTab` (the Members tab body, iOS analogue of web `/members`) was the role-bifurcated twin port —
  scope-cut-IS-the-run (2 tab bodies + 7 inline cards/picker/types ported; 6 forward-nav detail targets stubbed +
  the existing `ActivityTimelineDetailView` stub extended with `memberId`/`showActiveSeries` defaults, run-53/54
  stub-initializer lesson). Two durable patterns. **(a) Dep-purity is NOT guaranteed for a tab body just because
  prior screens were "no new dependency" — a small reusable chrome component co-located in a legacy DEFERRED Detail
  file isn't in the foundation.** `GlassButton` (28-line circular gradient icon button) lived in legacy's
  `Detail/ActivityTimelineViews.swift` (a deferred file), so the foundation port (run 50, "page-independent infra")
  never pulled it in; the first tab that needs it (run 55) ports it verbatim as new shared chrome → `Shared/Components/`.
  This is the file-pair-split corollary (run 7/54) for SHARED COMPONENTS: the deferred-file half holds not just
  detail VIEWS but reusable chrome the tab bodies depend on — grep the legacy import/usage against the foundation
  before claiming no-new-dep, and don't assume the streak holds. (Same run: the `memberTimelinePoints` free func +
  `SortField`/`SortDirection` ported now because the inline cards need them; the metrics-detail machinery
  `MetricsFilters`/`SortSheet`/`FilterSheet`/`clamp` deferred WITH `MemberMetricsDetailView` — the file-pair split
  WITHIN one bundled legacy file.) **(b) The behavior-diff's "add a web-parity banner?" verdict is decided by WEB's
  behavior, not by whether iOS swallows.** Run-52 added an error banner because web `/programs` SURFACED errors while
  iOS swallowed (gap → ADD). Run-55's `StandardMembersTab` ALSO sets an `errorMessage` it never renders — but the web
  `/members` landing surfaces NO load errors either, so **both-swallow = parity = NO ADD** (faithful-swallow IS web
  parity, the run-53 "behavior-diff comes back empty" shape, now on a data-FETCHING screen not a pure-nav shell). So
  a set-but-never-rendered iOS `errorMessage` is only a parity GAP worth an ADD if WEB surfaces the same error; if web
  swallows too, keep faithful + flag the vestigial state (F-row), don't add a banner. Reconfirmed: scope-cut-IS-the-run
  for N deferred targets (run 21/50/52/53/54 — now 6 detail stubs + 1 extended); D-REF keep-iOS-native for a structural
  idiom divergence the card-set already matches web on (run 52/53); read-only → `admin_only_data_entry` N/A (no log
  cards, unlike Summary run 54 — the read-vs-write axis); role rules code-answered by the Admin*/Standard* split →
  stated not asked; build owned by the user (Xcode), 20 new types grep-verified defined-exactly-once.
  **Run 56 reconfirmed both (`AdminWorkoutTypesTab`/`StandardWorkoutTypesTab`, the Lifestyle tab, Tab 3 = web
  `/lifestyle`) with two refinements: (a)** size the new dep PER-COMPONENT against the foundation, not per-file — a
  tab body's HEAVY shared logic can already be foundation infra even when its card VIEWS aren't (the
  `WorkoutPopularity*` sort/palette/`RankedBarList`/`SegmentedMetricPicker` landed run 50 as page-independent
  primitives; only the thin wrapping card views needed porting, so the one new dep `AccentChip` was even smaller than
  run-55's `GlassButton`). **(b)** the no-ADD verdict recurs on a fetching screen: web `/lifestyle` shows per-card "No
  data" with no error banner and legacy iOS swallows its `errorMessage` → both-swallow = parity = NO ADD (vs run-54
  Summary, where legacy iOS lacked the lock web showed → ADD). The verdict is set by WHAT WEB DOES — confirm web's
  behavior before adding.
- **Run 57 — a tab body composed of SIBLING SECTIONS cuts scope BY SECTION (port the light/nav sections, defer the heavy
  CRUD sections as INLINE stubs); and a run can CLOSE the whole multi-tab SHELL, not just a sub-route group.**
  `AdminProgramTab`/`StandardProgramTab` (the iOS Program tab, Tab 4 = web `/program`) was the LAST tab body, and porting
  it CLOSED the `AdminHomeView` 4-tab shell (Summary ✓54 · Members ✓55 · Lifestyle ✓56 · Program ✓57). Two durable
  patterns. **(a) The "scope cut IS the run" axis covers INLINE-composed sub-views, not just forward-nav detail
  targets.** Runs 54/55/56 deferred the `NavigationLink` DETAIL screens the cards push to; run 57 is the first to defer
  SIBLING SECTIONS that compose the tab inline — `AdminProgramTab` is a `VStack` of 5 sections, so port the 2 light/nav
  sections (`ProgramInfoSection` = select/edit/leave, `ProgramMyAccountSection` = account nav to already-deferred stubs)
  + their `sectionHeader`/`settingsRow` helpers, and defer the 3 HEAVY management sections (`ProgramMemberManagementSection`
  356 LoC / `ProgramRoleManagementSection` 291 / `ProgramWorkoutTypesSection` 370, each embedding its own roster/role-editor/
  workout-CRUD detail) as `ScaffoldPlaceholder` stubs that render as compact centered blocks INLINE in the scroll (a
  `ScaffoldPlaceholder` with no Spacers/frame takes its natural inline height). Size the cut by which sections are
  light-nav vs heavy-CRUD. **(b) "Closes the group" (run 30/32/38/46/47/53) scales to the home SHELL** — the 4th-of-4
  tab body closes the whole `TabView`; say "CLOSES the 4-tab home shell" in D-SCOPE + PROGRESS + COVERAGE, and the work
  drops to the DEFERRED DETAIL/SECTION layer (management sections, account/settings screens, detail views), each its own
  future "scope cut IS the run". Three reinforcements: **cross-file LOGIC-only de-dup is behavior-preserving, VISUAL is
  not (run 22/23)** — the Leave-Program state machine + async + alerts were byte-identical across both tabs but the two
  BUTTONS diverged (radius 14 inside-card vs radius 16 standalone), so extract the non-visual logic into a shared
  `.leaveProgramConfirmation` modifier (which web's extracted `LeaveProgramButton` VALIDATES) and keep each button's
  styling + `isLeaving`/`isPresented` @State inline; **D-REF keep-iOS-native can carry TWO divergences at once** (native
  multi-screen management vs web's flat hub + iOS-only Notifications/Support account rows, push being `consumed_by=[ios]`)
  — both kept native + flagged, the card set + role gating already match web → idiom not gap; **verify an
  `@EnvironmentObject` dep is actually INJECTED before porting verbatim** — `ProgramMyAccountSection`'s `themeManager`
  isn't injected in `AppRootView` (only `programContext` is) but IS injected at the `@main` App level, so trace the
  injection up to `@main`, not just the nearest view (the dead-code drop of legacy's unreferenced `PlaceholderTab` is the
  run-7 pattern, cross-platform — grep refs in BOTH legacy + rebuilt before dropping).

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append
the new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons";
keep this `SKILL.md` lean.
