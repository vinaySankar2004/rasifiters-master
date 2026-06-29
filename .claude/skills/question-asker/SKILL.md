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
  question dimension, not an afterthought.
- **Separate locked-by-METHODOLOGY decisions from genuinely-open ones before asking.** Decisions already
  fixed in the R-log (e.g. R1's proxy model / retired tables / `auth_user_id`) are stated as context, NOT
  re-asked — keeps the round to the few real choices (auth run 1: 4 real Qs, all faithful).
- **Migration features get a "migration delta" section** (what STAYS vs what CHANGES) — for any feature
  ported onto a new stack/provider it's the highest-value part of the SPEC and keeps the
  faithful-vs-changed line crisp (see `specs/features/auth/SPEC.md` §7). The load-bearing question for a
  "self-signed JWT → managed auth provider" migration is the **token-verify claim source** (verify method
  + whether you add a per-request DB lookup) — lead with it.
- **Dead-route check via the consumption sweep:** before speccing a backend CRUD feature, the cross-app
  sweep must confirm **which routes each client actually calls** — a route existing ≠ a route used. Routes
  called by *neither* client are vestigial: keep them for parity but **flag** them (§10), don't treat them
  as load-bearing (members run 2: `POST`/`DELETE /api/members` are called by neither web nor iOS — it
  reframed the whole feature). When such a route's faithful behavior is a **latent bug** (members'
  `createMember` ignores `password` → unloggable member), surface it as a decision (faithful-keep vs
  fix-now) — the user often picks fix; then a **scope-pinning follow-up** locks the mechanics (the email
  source Supabase `createUser` needs; that the cleanup is createMember-only) so the SPEC stays prescriptive.
  Also: any "returns full rows" handler may now **leak a migration-added column** (`getAllMembers` +
  `auth_user_id`) — exclude it to preserve the legacy response shape.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append
the new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons";
keep this `SKILL.md` lean.
