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
From a session rooted at `rasifiters-master/`. Cite `file:line` from the **product being documented**.
The faithful-rebuild reference implementation is the LEGACY app at
`/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}` —
cite it as the baseline being faithfully rebuilt. RaSi has three products:
- **web** — Next.js 14 App Router (legacy: `rasifiters-webapp/src/app/**`, e.g. `summary/`, `members/`, `program/`, `lifestyle/`).
- **ios** — SwiftUI (legacy: `ios-mobile/RaSi-Fiters-App/Features/**`, e.g. `Home/`, `Auth/`, `Onboarding/`).
- **backend** — Node/Express + Sequelize (legacy: `backend/routes/**`, e.g. `members.js`, `workouts.js`, `analytics.js`, `auth.js`).

## Prereqs (confirm first)
- **Know the target.** Confirm with the user exactly which page/view/route/module this run covers.
  Check `COVERAGE.md` for its row + the **owning split**, and `features/REGISTRY.md` for any
  neighboring features (that split is your lead option for the scope question). (These index docs may
  not exist yet on a fresh repo — create/seed them as the first runs land.)
- **Decide page/view vs module** (changes question 1 — see §3):
  - **Page/view/route** = owns a surface a user lands on (a web route, an iOS view, an Express
    route group). First question is identity/purpose.
  - **Feature-module** = owns no standalone surface, mounted/imported by pages/other modules. First
    question is the **ownership/scope-boundary cut** — what this SPEC owns vs references as a dependency.
- The output contract is a single-file `SPEC.md`. The answers land in **§9 Decisions made** (a
  `D-xx` table) and **§10 Open questions / flagged characteristics (kept as-is)**.

## Workflow

### 1. Opening sweep — "agents map, I verify" (read-only, cite paths)
Map the target before asking anything. Inventory in order: frontend route/components/views
→ API/proxy endpoints → backend handlers → DB tables/columns → env/flags → **cross-product glance**
(same surface in the other products — only to *notice* reuse/variation, not audit). For RaSi this
is usually a **web page ↔ iOS view ↔ Express route** triangle for the same domain concept (e.g. the
member workout log appears in `rasifiters-webapp/src/app/members/workouts`, `ios-mobile/...Features/Home/...`,
and `backend/routes/workouts.js`).
- **Fan out by sub-surface, not by file count.** For anything non-trivial (a multi-tab view, a
  multi-cluster component), launch 2–3 `Explore` agents — e.g. *web summary cluster · iOS home cluster ·
  backend route + cross-product wiring*. Agents produce the map fast.
- **Then verify.** Re-read the 2 biggest load-bearing files in full + spot-check the rest. **Every
  `file:line` that will land in the SPEC must be confirmed against source by you, not trusted from
  the map.** This catches drift the map glosses (wrong path, a prop/binding passed-but-unused).
- Produce a short **surface map** (frontend → api → backend → data → flags) and **auto-tag** the
  feature-modules it touches. Surface the **single biggest cross-product divergence** now (e.g. a
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
  question (does web/iOS behave the same here?) + the desired-changes question, **fused with the §3
  dynamic follow-ups** the sweep raised, so Round B is mostly real, cited decisions rather than
  generic prompts.

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
- *"What's the single biggest cross-product divergence (web vs iOS), and which side wins?"* — resolve first.
- *"Mount here, internals deferred?"* — for providers/theme/overlays/auth-context: document *where* it
  mounts + the one hook a sibling drives, defer internals to the dedicated later feature.

### 4. Completeness-critic pass before sign-off
Don't trust the first sweep. Re-sweep from independent angles (frontend · backend+data ·
config/flags/edge-cases · cross-product web↔iOS), each grounded in `file:line`; anything new may
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
  `D-REF` for the reference-impl/cross-product decision; a stance row for faithful-vs-change). Each
  row states the decision + the `file:line` / COVERAGE item it rests on. The scope cut, the
  borderline-UI cut, and the stance from §3's tight shape are usually the first rows.
- **§10 Open questions / flagged characteristics (kept as-is)** — every "deliberate oddity, kept
  under the faithful stance": no-op controls, vestigial props/bindings, client-only behaviors,
  load-bearing parsers/transforms that ripple across neighbors, web-vs-iOS divergences left intact.
  Each cites `file:line` and notes whether it's a rebuild cleanup candidate.
Then present the surface map + draft decisions for sign-off, tick `COVERAGE.md`
(`[x]` fully covered, `[~]` partial with the owning split spelled out), and note the reference impl
(which legacy path it faithfully rebuilds).

**Forward pointer (QUESTIONS.md):** this loop resolves *documentation-time* intent → SPEC §9/§10
**only**. The contract's `QUESTIONS.md` (`METHODOLOGY.md` §B / the `stitch` skill) is a *different* set — *stitch-time*
adaptation knobs (auth model · table prefix · flags · branding) asked when cloning the reference impl
into a new company. It is **not emitted yet** (all shipped features are single-file SPECs); when the
SPEC/FLOWS/SCHEMA/QUESTIONS/CHANGELOG contract splits, extract those knobs into `QUESTIONS.md` then.

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
- **Cross-product divergence is RaSi's signature decision:** web and iOS often render the same domain
  concept differently (a control present on one client, an admin gate on another). Surface it in §1,
  resolve "which side wins / keep both" first in §3, record it as `D-REF` in §9.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append
the new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons";
keep this `SKILL.md` lean.
