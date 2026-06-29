# git-version — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable, project-agnostic patterns are distilled in `SKILL.md` → "Converged lessons".
> **Protocol:** append one entry per skill run below; when a pattern proves itself across runs,
> promote it into `SKILL.md` "Converged lessons" and keep this archive as the detailed history.

## Lessons log (append every run — the self-learning loop)
Before ending a run, capture what you learned: a detect/bump call that was non-obvious, a
blast-radius reverse-scan subtlety, a dangling-edge case, anything awkward in staging/tagging.

### 2026-06-28 — Run 1: `auth` SPEC commit (first feature)
New feature, no prior version → **v0.1.0**. Split into a `docs(auth)` feature commit (SPEC + registry +
REGISTRY + COVERAGE + PROGRESS) tagged `feature/auth@v0.1.0`, and a separate `chore(skills)` commit for
the question-asker lessons (per the "lessons edits = separate chore commit" rule). Session-scoped
staging (explicit `git add`, no `-A`). Tags invariant held (1 node = 1 tag).

### 2026-06-28 — Run 2: `auth` faithful PORT (status flip, no bump)
Ported the legacy auth layer into `apps/backend/`. Key call: **a faithful port is a `feat` progress
commit with NO semver bump** — the SPEC contract (D-C1/2/3) didn't move, so v0.1.0 stays; only the
status flipped 📄 documented → 🏗️ built (registry.json `status`, REGISTRY.md emoji, SPEC header +
a `0.1.0 (built)` §changelog note). **Tag refresh on a flip:** `git tag -f feature/auth@v0.1.0` moved the
tag from the SPEC commit (aeeba10) to the built commit (6c792ad) — needs a `git push -f` for that one tag
since v0.1.0 was already pushed. Blast-radius: `auth → dependents: [] · apps: [web, ios]`, no contract
change → FYI only, no gate. Mapped the rebuilt `apps/backend/**` code to the `auth` feature (the
registry `reference_impl.paths` still name the *legacy* `../backend` paths; the rebuilt-code↔feature
mapping is by correspondence, not by those paths).
**Pattern to watch:** when one feature's port creates shared foundation (models for *other*, unspecced
features), that foundation rides in the same feature commit — it's not its own feature delta. Fine for
now; revisit if a later feature needs to claim ownership of a model file.

_Earlier note: this was a fresh ICM repo; `auth` is the first documented + first built feature._

### 2026-06-28 — Run: programs feature (v0.1.0 + port)
**Shape:** a NEW node committed *and* ported in one session → a single `feat(programs)` commit (SPEC +
code + registry/REGISTRY/COVERAGE/PROGRESS + server.js mount) with the status flip 📄→🏗️ folded in (no
separate flip commit, since this is the node's first appearance), plus a separate `chore(skills)` commit
for the question-asker LESSONS_ARCHIVE. **Bump:** new feature → v0.1.0, no confirmation needed (user named
the tag). **Blast-radius:** new node, `depends_on [auth, program-memberships, notifications]` (two dangling
forward edges — fine, additive/FYI, no gate); `consumed_by [web, ios]`. **Status consistency catch:** I'd
initially set programs `documented`/📄 in the registry, but it was actually *ported* (same state as
`members` = `built`/🏗️) — flipped registry/REGISTRY/SPEC-header/COVERAGE/PROGRESS to 🏗️/`built`/[x] before
committing so the two ported backend features read consistently. **Lesson: when a run both specs AND ports,
the registry status is `built` not `documented` — match the sibling feature's representation, don't leave
it at the spec-only state.** **Tag gotcha: `git push --follow-tags` does NOT push lightweight tags** (these
feature tags are lightweight) — had to `git push origin feature/programs@v0.1.0` explicitly. **Lesson: for
this repo's lightweight feature tags, push the tag by name (or use `--tags`), not `--follow-tags`.**

### 2026-06-28 — Run: wire the two deferred 501 delete cascades (auth + members @ v0.2.0)
**Shape:** a *fill-in-the-deferral* change — two routes that shipped as documented `501` stubs (auth
`DELETE /account`, members `DELETE /:id`) became functional now that their cross-feature dependencies
(program-memberships/invites/notifications) are ported. This is a real behavior delta (501→200), so it's a
**MINOR bump** (functionality previously deferred), NOT a faithful no-bump flip. **One commit touched THREE
features:** the byte-identical legacy cascade was extracted into a single new export
`cascadeMemberDeletion` on `utils/programMemberships.js` — a registered `reference_impl` path of
**program-memberships** — so that feature ALSO took a MINOR bump (additive owned-interface growth,
`handleMemberExit` unchanged, zero dependent re-version). **Lesson: a single behavioral commit can map to
multiple features via reference_impl paths — bump each touched feature, even the one that only gained a new
shared export.** **Mutual-edge bookkeeping:** auth + members now *import* program-memberships' util →
each gained `depends_on: program-memberships`. program-memberships already depended on auth+members
(middleware/models), so this completes a legitimate **mutual edge** (cycle). The skill explicitly allows
this ("Mutual edges need BOTH halves written") — wrote both halves. Additive edges to an already-built node
= FYI, no gate. **DRY-vs-faithful judgment:** legacy duplicated the cascade verbatim across two services;
chose to single-source it in the util that already owns `handleMemberExit` rather than copy-paste — matches
the workspace DRY standard while staying behavior-faithful (each caller keeps its own tx/guard/404/message).
**Three tags this run:** `feature/{auth,members,program-memberships}@v0.2.0`; verified each registry node's
current version has a matching tag (6 nodes, all current). **Push:** lightweight tags → `git push` then
`git push origin <tag>...` by name (not `--follow-tags`).
