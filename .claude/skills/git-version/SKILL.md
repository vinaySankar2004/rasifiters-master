---
name: git-version
description: rasifiters-master's OWN git skill — stage, detect touched feature(s), propose a semver bump, emit the blast-radius report, update registry.json + REGISTRY.md + the SPEC §12 Changelog, commit, and tag feature/<feature>@<version>. This is the repo's git skill — use it for every commit here. Trigger: git/commit/version/bump in rasifiters-master. LIVING — append LESSONS_ARCHIVE.md every run.
---

# Git Version — ICM commit + version pipeline (LIVING)

> **This is rasifiters-master's own git skill** — use it for every commit while rooted here.

## Trigger
"git", "commit", "/git", "/commit", "version", "bump", "/git-version", or any time you are about to
commit while rooted in `rasifiters-master/`.

## Where to run
From a session rooted at `rasifiters-master/`. Operates on this repo's git + `specs/features/registry.json`
+ `specs/features/REGISTRY.md` + `specs/features/<feature>/SPEC.md` (its `## 12. Changelog`).

## Prereqs
- `registry.json` is the source of truth for the dependency graph: `depends_on` (feature→feature) and
  `consumed_by` (apps — `web` / `ios` / `backend`) per feature. A feature can be CLIENT-SPECIFIC:
  `consumed_by` may be just `[web]` or `[ios]` (e.g. iOS widgets / deep links / push-token registration are
  ios-only; some bulk admin tools may be web-only) — don't assume every feature is shared across clients.
- SPECs are single-file today; the changelog lives in the SPEC's `## 12. Changelog` section — **no
  separate `CHANGELOG.md`** until the feature contract splits (then migrate §12 → CHANGELOG.md).
- Use the session's current date (from the system reminder); skills can't call `Date.now()`.

## Workflow
1. **Stage — session-scoped by default.**
   - **Default** (plain "git"/"commit"/"version"/"bump"): stage ONLY the files this session worked
     on — track the files you created/edited and `git add <file1> <file2> …` them explicitly. Do NOT
     run `git add -A`/`git add .`; unrelated changes from other sessions or manual edits must not be
     swept into this commit. (Include the registry/REGISTRY/SPEC files this run touches in steps 5–7.)
   - **Explicit "commit everything"/"commit all changes"/"commit all"**: `git add -A`.
   - Scope to a dir the user named when they name one. If the session's touched files are unclear
     (e.g. context was summarized), check `git status` and ask before falling back to `git add -A`.
2. **Detect touched feature(s).** Map each staged path:
   - under `specs/features/<feature>/…` → that feature;
   - matching a feature's `reference_impl.paths` in `registry.json` → that feature (the rebuilt
     `apps/{web,ios,backend}/**` code, once it exists);
   - `COVERAGE.md` / `registry.json` / `REGISTRY.md` / `.claude/**` / methodology
     docs → **tooling/docs, not a feature bump**.
   If **no feature** is touched → plain docs/tooling commit: skip steps 3–7, just commit with
   `type(scope): desc`.
3. **Propose a semver bump** per touched feature (CONFIRM with the user):
   - new feature (no prior version) → `v0.1.0`;
   - pre-1.0 clarifying/additive SPEC edit → **PATCH** (`0.1.0→0.1.1`);
   - pre-1.0 newly-documented behavior/section → **MINOR** (`0.1.0→0.2.0`);
   - contract change (`depends_on`/`consumed_by`/`reference_impl`/owned interface) → **MINOR**
     pre-1.0 (0.x breaking convention), **MAJOR** at/after 1.0.
4. **Blast-radius report** (FYI now, hard-gate on contract change):
   - **dependents** = features whose `depends_on` includes this feature (reverse-scan `registry.json`);
   - **consumers** = this feature's `consumed_by` apps (`web` / `ios` / `backend` — may be a single client);
   - print: `editing <feature> → dependents: [..] · apps: [..]`.
   - If the change touches the feature's **contract** (`depends_on`/`consumed_by`/`reference_impl`/
     owned interface) → **STOP and ask the user to acknowledge propagation** before continuing.
     Pure SPEC-wording edits → one-line FYI, proceed.
   - **Doc blast-radius (volatile-doc prune):** if the commit DELETES a dated/strikethrough log entry
     from a volatile doc (an `ICM.md` Open-follow-ups list, any current-state list), first verify the
     resolved fact lives in its canonical home — feature SPEC §12 + registry / an R-entry in
     METHODOLOGY / or it was pure verification with no durable artifact. Don't prune until the home is
     confirmed. See METHODOLOGY.md "Log retention & pruning" (R12).
5. **Record the version label (registry + SPEC Changelog — NO version folders):**
   - `registry.json`: set the feature's `version` field to the new version; update
     `reference_impl`/`consumed_by`/`depends_on`/`status` in place.
   - `REGISTRY.md`: bump the feature's *Version* cell + SPEC link.
   - SPEC `## 12. Changelog`: prepend `- **vX.Y.Z** (<date>) — <what changed>`.
   - The version is a LABEL recorded in the registry `version` field + the SPEC Changelog + the git tag —
     **never a `<version>/` folder**. SPECs live flat at `specs/features/<feature>/SPEC.md`.
6. **Commit.** `type(scope): desc` (e.g. `docs(<feature>): SPEC vX.Y.Z + registry`).
7. **Tag.** `git tag feature/<feature>@vX.Y.Z` (lightweight) on the new commit — one per touched
   feature.
8. **Prompt:** `> Committed + tagged feature/<feature>@vX.Y.Z. Run \`git push --tags\` when ready.`

## Backfill (when needed)
If features were committed before this skill existed, backfill their tags so registry↔tags agree.
For each such feature/version:
```bash
git tag feature/<feature>@v<X.Y.Z> "$(git log -1 --format=%H -- specs/features/<feature>/SPEC.md)"
```
Verify: `git tag -l "feature/*"` count must equal the registry node count.

## Converged lessons (durable — fold new patterns here as they recur)
- **Map the changeset to feature(s) first:** detect which `reference_impl` paths a commit touches; a mixed
  changeset can map to several features (or none → a plain chore). A purely cosmetic `apps/**`
  refinement that doesn't change behavior is **not** a feature delta → no bump; the bump comes only from a
  `specs/features/**` SPEC or registered `reference_impl` path.
- **Uniform owned-interface change; backward-compat → no propagation:** an owned-interface change
  documented in the feature's `specs/features/**` SPEC **is** a real bump (the SPEC edit maps to the feature, and
  the owned interface genuinely moved). If it's
  backward-compatible (new fields/tokens added, legacy aliases kept; the output shape + exported
  symbol *names* unchanged, only string values + accepted input tokens), it's **MINOR with zero dependent
  re-version** — dependents consume the output/symbols, not the emitted tokens, so blast-radius is FYI not a
  gate (confirm no dependent hardcodes the renamed value). Propagating the renamed term into a *dependent's*
  cross-ref prose is a no-bump `docs` commit (≠ a note about that feature's OWN behavior, which is a PATCH);
  never `replace_all` a SPEC that mixes current-state with a dated §12 changelog — target the current-state lines.
- **Graph direction — `depends_on` vs `consumed_by`:** an *import* of another feature's code earns a
  `depends_on` edge; a *read* of its data/route does not (the import-vs-read discriminator). Mutual edges
  need BOTH halves written. For RaSi, web/ios/backend are *apps* (`consumed_by`), not features — and a
  feature's `consumed_by` may name a single client (a feature can be web-only or ios-only).
- **Dangling edges:** a forward `depends_on` to an unbuilt node, or a reverse `consumed_by` waiting for its
  producer, is fine — satisfy it when the other node lands; a phase-closing run reconciles the accumulated set.
  First-time node creation that *satisfies* a pre-existing dangling edge is **additive, FYI only, no gate** —
  hard-gate only when an **existing** node's contract changes.
- **Tags invariant:** `git tag -l "feature/*"` count must equal the registry node count after each run.
- **Commit shapes:** (a) *progress* `feat` (ports code, defers the status flip); (b) *flip* (status
  `documented→rebuilt→deployed`, refresh `feature/<f>@<v>` tag, **no semver bump** for a faithful rebuild);
  (c) *contract change* → real semver bump + §12 Changelog; (d) *faithful asset/format refinement* on a
  deployed feature (e.g. logo PNG→SVG, no contract/behavior delta) → **PATCH** + §12 — the shipped impl
  changed (so not a no-bump flip) but no new owned files/behavior (so not MINOR). A semver bump tracks a real
  impl/contract delta, NOT a faithful status flip (which refreshes the tag in place, no bump).
- **Lessons edits = a separate `chore(skills)` commit.** The skills' `LESSONS_ARCHIVE.md` files ARE in-repo,
  so they commit normally; methodology/playbook docs that live outside this git repo are intentionally
  untracked — don't hunt for them in `git status`.
- **Blast-radius report before commit:** name every app (`web`/`ios`/`backend`) + downstream feature a
  change touches; for a docs/skills-only change the expected report is "zero feature impact" → a chore, no tag.
- **Volatile-doc log hygiene (R12):** durable docs (SPEC §12, METHODOLOGY log, LESSONS_ARCHIVE) are
  append-only; volatile docs (ICM Open follow-ups) prune-on-resolve — strike + `DONE`, delete next pass.
  Before deleting a volatile log entry, run the **doc blast-radius check** (outcome captured in its
  canonical home, or it was pure verification) so pruning never loses a fact.

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:**
append the new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons";
keep this `SKILL.md` lean.
