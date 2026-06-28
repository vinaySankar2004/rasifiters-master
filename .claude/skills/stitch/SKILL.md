---
name: stitch
description: Assemble a product from documented features — read the target manifest, then per feature read its SPEC, copy the reference implementation (the legacy RaSi Fiters app), and adapt it on the stitch knobs (auth · brand · theme · table names · flags · URLs). Two modes — Mode R (faithful rebuild of the same company into an ICM product) and Mode S (stitch a NEW company's app). LIVING — append LESSONS_ARCHIVE.md every run. Trigger — "stitch", "rebuild <feature>", "assemble <company>'s app".
---

# Stitch — assemble/rebuild a product from feature SPECs (LIVING)

Assemble a product from versioned features: for each feature in the target `manifest.md`, read its
SPEC, copy the designated reference implementation, and adapt it on the stitch knobs. The **SPEC is
canonical, the reference impl is the starting code, the knobs drive the adaptation.**

> **RaSi Fiters context.** Company = `rasifiters` (a fitness-program tracker). Products = `web`
> (Next.js 14 App Router + Tailwind), `ios` (SwiftUI), `backend` (Node/Express + Sequelize). The
> **faithful-rebuild reference implementation** is the LEGACY app at
> `/Users/vinayaksankaranarayanan/Desktop/RaSi-Fiters/{rasifiters-webapp, ios-mobile, backend}`.
> Run the build loop once per feature in `depends_on` order; refine this doc + append a lessons run
> each time. `QUESTIONS.md` is not emitted yet (single-file SPECs) — the knob taxonomy below stands
> in, sourced from each SPEC's §7/§9/§10.

## Two modes
- **Mode R — faithful rebuild (same company).** Source = the legacy reference impl
  (`rasifiters-webapp` / `ios-mobile` / `backend`); target = the **same** company's ICM product
  (`companies/rasifiters/products/{web,ios,backend}`). Adaptation ≈ identity (brand unchanged;
  Supabase project + table names per the company `CONTEXT.md`). Purpose = stand up the ICM product
  from the SPECs. Knobs are mostly no-ops but still **recorded**. Hand off to the `deploy` skill once
  a renderable slice lands.
- **Mode S — stitch a new company.** Source = a chosen feature version's reference impl; target = a
  **new** company's product. Adaptation is real — **ask the user** the knob questions
  (`AskUserQuestion`) before adapting. **Mode S is UNTESTED** (fresh ICM repo); expect new edge cases
  (esp. the Supabase Auth + storage knobs) on the first real run.

## Trigger
"stitch", "rebuild `<feature>`", "assemble `<company>`'s app".

## Where to run
**From a session rooted at `rasifiters-master/`** — only there do the scoped MCPs + deny rules load.
The legacy reference impls (`../rasifiters-webapp`, `../ios-mobile`, `../backend`) are readable via
`.claude/settings.local.json` `additionalDirectories` (or `claude --add-dir ..`).

## Prereqs (confirm first — STOP if any fail)
- The feature is **documented** (`features/<f>/<v>/SPEC.md` exists, status `documented`+). Stitch
  builds from SPECs; if it's undocumented, run `question-asker` first.
- Build in **`depends_on` order** (bottom-up). A feature's deps must already be stitched (or
  deliberately stubbed — see step 3). The brand/theme leaf is the floor; the landing/home surface
  (most deps) is built last in the foundation slice.
- The target product scaffold exists (`companies/<co>/products/<p>/` — for `web`: a Next.js
  `package.json` + `.env.example`; for `backend`: a Node/Express `package.json` + `.env.example`; for
  `ios`: the Xcode project). If not → scaffold the product skeleton first (the `deploy` skill /
  methodology, new-product path).

## Workflow (per feature — the build loop)
1. **Read the SPEC contract** — §1 *owned* vs *referenced*, the `reference_impl.paths` (from
   `registry.json`), §9 Decisions, §10 flagged characteristics. Port the **owned** set only;
   "referenced-not-owned" files belong to another feature (ported earlier, or stubbed).
2. **Confirm the reference source** exists for each owned path under the legacy app
   (`../rasifiters-webapp/`, `../backend/`, or `../ios-mobile/`). A trailing-slash entry = the whole
   directory.
3. **Capture the import surface** of each file. For web/backend (JS/TS):
   `grep -nE "^import |require\(|^from "`; for iOS (Swift): `grep -nE "^import |@_exported"`. Split
   into (a) external npm / SwiftPM, (b) intra-feature, (c) **cross-feature**. (c) is the *seam list*
   — each must resolve to an already-ported file or a **deliberate stub** (a throwing hook / no-op
   component / empty-result fetch) you replace when that feature lands. Log every stub.
4. **Copy each owned file** to the matching target path, **mirroring the source layout exactly** so
   relative imports port unchanged. Faithful stance — no restructure, no "improvement" (record
   oddities as the SPEC's §10 flagged characteristics, change nothing). Verbatim files → `cp` for
   byte-fidelity; binary assets always `cp`.
5. **Adapt only the stitch knobs** (see taxonomy below) and record each knob + the value chosen
   (Mode S: ask the user first). In Mode R most are identity.
6. **Expand the manifests** to exactly what the ported files import — npm → target `package.json`
   (`dependencies`), SwiftPM → the Xcode project, at the **exact reference-impl versions** (read the
   source `package.json`). Add **only** what this slice imports; do not pull future features' deps.
7. **Wire into the app** — web: replace the relevant stub (`app/layout.tsx`, `app/page.tsx`) and add
   owned `app/api/*/route.ts` proxies; backend: register the owned routers in `server.js` (or the
   route index); iOS: wire the view into the navigation tree.
8. **Advance status 📄 → 🏗️** — `features/registry.json` (`versions.<v>.status: "rebuilt"`, keep
   `latest`), the SPEC §12 Changelog, and **populate the target `manifest.md` stitch list**.
9. **Commit + tag via `git-version`**. Faithful rebuild = status flip, **no semver bump**; commit
   `feat(<f>): rebuild <v> → <product> code`, refresh `feature/<f>@<v>`.
10. **Append a lessons-log run** below (in `LESSONS_ARCHIVE.md`) — knobs surfaced, seams stubbed,
    gotchas.

## Adaptation knobs (the QUESTIONS.md taxonomy)
The values a target swaps when cloning a feature. Mode S asks them; Mode R records the (mostly
identity) defaults. Per feature, only the knobs it actually exposes apply. Paths below are the legacy
reference-impl locations.

| Knob | Lives in | reference-impl default (legacy RaSi) | Find it |
|---|---|---|---|
| **Brand identity** | web `src/components/BrandMark.tsx` + `src/lib/config.ts`; iOS asset catalog | "RaSi Fiters" name + logo/favicon | brand/theming SPEC §7 |
| **Text self-references** | component/lib copy that names the app (labels, placeholders, empty-states, tooltips, page titles, export/file stems, "generated by …") | many strings hardcode **"RaSi Fiters"** | must read a `BRAND`/config constant, never a literal — see below |
| **Color / theme** | web `src/lib/theme.ts` + `theme-provider.tsx` + the Tailwind `rf-*` CSS vars (`tailwind.config.ts`); iOS `Color`/asset catalog | the `rf-*` palette (light/dark via CSS vars) | theming SPEC §7 |
| **Auth model** | web `src/lib/auth/session.ts` + `middleware.ts`; backend `middleware/auth.js` + `services/authService.js` | **Supabase Auth** — Express proxies it, verifies Supabase JWTs, maps via `members.auth_user_id`, keeps existing member UUIDs, bcrypt-hash on import | auth SPEC §7 |
| **Table names** | backend `models/` (Sequelize) + `services/` + any `sql/` | **NO table prefix** — faithful legacy schema names (`members`, programs, workouts, …) | company `CONTEXT.md` |
| **Supabase project** | `.mcp.json` `project_ref` + `DATABASE_URL` (Railway) + web `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` | **own fresh project per build** — `TODO(provision)` until provisioned | company `CONTEXT.md` Infrastructure |
| **Storage backend** | web `src/lib/storage.ts`; backend storage service | **Supabase Storage** (sign-on-read) | `storage-backend` SPEC |
| **Feature flags** | web `.env.example` (`NEXT_PUBLIC_*_ENABLED`); backend `.env.example` | per the legacy `.env.local` (e.g. the admin-only data-entry lock per program) | product `CONTEXT.md` |
| **Env values** | web/backend `.env.example` (names) | names mirror the legacy `.env.local` | `deploy` skill fills values |
| **Legal / external URLs** | web footer / support / privacy pages | `rasifiters.com/privacy-policy`, `rasifiters.com/support` | per-feature SPEC §7 |

**Text self-references — stitch check (Mode S).** A re-branded build must say the *new company's*
brand in all its own copy. After re-skinning, grep the web product's `src` for stray legacy literals
— it should return **nothing** but infra/asset refs:

```
grep -rni "RaSi Fiters\|RaSi-Fiters\|rasifiters" companies/<co>/products/web/src \
  | grep -vi "alt=\|public/\|rasifiters.com\|X-RaSi\|className"
```

Any remaining hit is a self-reference that must be re-pointed at the brand/config constant. The
backend has the same trap: any column DEFAULT or seed string that hardcodes "RaSi Fiters". In Mode R
(same company) this whole check is a no-op — record it, change nothing.

## Confirm before outward actions
Stitch itself only writes repo files (safe). The **deploy** hand-off (Vercel/Railway, env, billable)
follows the `deploy` skill's confirm discipline. No direct DB writes — schema via migration files the
user runs; the auth import (bcrypt-hash of legacy member passwords) is a one-time user-run script.

## Relationship to `audit`
`audit` (sibling stub) is the cross-product diff: when ≥2 products implement a feature (here **web vs
ios** against the shared Node/Express backend), classify each difference {intentional · drift ·
accidental-rewrite · dedup · one-side-more-optimized} and pick the canonical version before stitching.
Run it pre-stitch in Mode S once a second impl exists; not needed for the Mode R faithful rebuild
(single legacy source).

## Converged lessons (durable — the patterns that recur)
Project-agnostic patterns distilled from prior ICM stitch experience. (Run history →
`LESSONS_ARCHIVE.md`, not auto-loaded. This repo is fresh — no runs yet.)
- **Seam-stub to the import contract:** when a dep isn't built yet, stub it to match the *exact*
  destructure / props / return the caller expects — not a generic placeholder; read the CONSUMER's
  usage (the import line + the call sites + the field accesses), then return the real shape with
  empty/no-op values. The build must stay green. Component → `null`; data-fetch → empty
  (`[]`/`null`); a hook → its destructured shape; a *called* lib → shaped non-crashing returns.
- **Import-closure audit before any flip:** programmatically resolve every relative import (0
  unresolved / 0 undeclared) — critical at scale; a render feature drags its whole mount tree, so the
  SPEC's `reference_impl` list under-counts the seams. Closure misses **runtime** seams, so grep
  separately for auth calls, middleware-injected context, and feature-flag / `process.env` reads, and
  confirm each has a provider present.
- **Predict the seam count from the feature KIND, not its size:** a feature that OWNS its entry
  surface (pages + server logic) closes cleanly; one that MOUNTS others' components fans out. A
  leaf-renderer rebuilt AFTER its host = a stub→real swap (0 consumer edits); a host rebuilt before
  its leaves = mount + stub. A late feature inherits already-shipped seams → cleaner than its size
  implies.
- **Jointly-owned files:** port with the LAST co-owner; defer the status flip until the whole
  `reference_impl` is present. Two mutually-dependent features that share split-by-axis files rebuild
  together as ONE milestone (port the shared file once, flip both).
- **Backend can't stub:** the frontend can stub cross-feature seams (the slice doesn't exercise
  them); the backend must actually boot + serve, so port the real files even if they belong to a
  not-yet-flipped feature (those stay 📄 until their *whole* `reference_impl` is present).
- **`cmp -s` pre-port audit:** byte-diff each target path BEFORE porting — a feature's own
  `reference_impl` path (esp. a mutual-edge file) may already have shipped with an earlier co-owner's
  rebuild; skip the copy to keep the commit minimal. Often most of a feature is already present.
- **Honest flip:** flip 🏗️→🚀 only the part whose round-trip you verified; caveat unverifiable
  surfaces. A public/unauthenticated surface discharges its own verification headlessly; a gated
  surface carries a credentialed-verification debt forward.
- **Never Edit a ported file (Mode R):** `cp` it and leave it byte-identical; the adaptation lives in
  the wiring file (`app/layout.tsx`, `server.js`) + the tracking docs, never in the owned code.
  Verify with `cmp` that source==target for the owned set.
- **A faithful stitch can be immediately followed by a deliberate KNOB deviation** (e.g. swap the
  storage backend to Supabase Storage). The faithful rebuild establishes the baseline; a product knob
  can then deviate it — record the knob as parked; the feature stays 🏗️ until the swap lands.
- **The storage knob ripples beyond the upload routes:** `grep -rn "@vercel/blob\|vercel-storage"`
  the WHOLE product — it touches upload routes, the call-sites, dedup helpers, the image-proxy
  allowlist, and any output-mirror.
- **Mode S (new company) is untested** — the knob-question flow is drafted but unproven; the Supabase
  Auth + storage knobs are the most likely to surface edge cases.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append
the new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons"; keep
this `SKILL.md` lean.
