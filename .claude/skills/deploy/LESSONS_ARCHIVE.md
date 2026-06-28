# Deploy — LESSONS ARCHIVE (verbose run-by-run history)

> Full run history, moved out of `SKILL.md` to keep it lean (not auto-loaded into context).
> Durable patterns are distilled in `SKILL.md` → "Converged lessons". Append new runs HERE.

## Lessons log (append every run — the self-learning loop)

### Entry template
- **Run N — <product> <milestone> (YYYY-MM-DD) — <FIRST DEPLOY | REDEPLOY on existing infra> ✅/🏗️**
  - Targets: web → Vercel `<project>` (`<url>`); backend → Railway `rasifiters-api` (`<url>`).
  - What the deploy actually needed (env/secrets/schema/bucket/auth): …
  - Gotchas hit + the fix: …
  - Verify done (headless) vs owed (signed-in/storage/push): …
  - Flip call (🚀 full / 🚀 partial + caveat / 🏗️ hold) + why: …
  - New durable pattern promoted to Converged lessons: <… or none>.

## Runs

### Run 1 — RaSi Fiters Supabase provisioning (2026-06-28) — PROVISION (no code deploy) ✅
- Targets: **Supabase only.** Created org `RaSi Fiters` (`lxehyprifvuozciizlem`) + project `rasifiters`
  (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY). Railway/Vercel deferred — `apps/web` +
  `apps/backend` are still empty CONTEXT-only shells, so there's nothing to deploy; provisioning their
  shells now would only add empty projects. Correct order = Supabase first (unblocks the migrator, step 3).
- What it needed: a NEW org (user choice) → `supabase orgs create`; a DB password (`openssl rand -hex 24`,
  URL-safe hex); region `us-east-1`. Captured anon/service_role (legacy JWT) **and** the new
  publishable/secret keys, plus 3 DATABASE_URL forms, to a gitignored scratchpad env file for the user's
  password manager.
- Gotchas hit + fix:
  - **`supabase` CLI v2.67 `--region` enum is empty/broken** → every `projects create --region …` errors
    `must be one of [  ]`, and region is required. Fix: upgrade the CLI (`brew upgrade supabase`, needed
    `brew trust supabase/tap` first). v2.108 accepts `us-east-1`.
  - **Org must exist before project create** (`--org-id` is required); the CLI *can* create orgs
    (`supabase orgs create "<name>"`) — no dashboard/billing step needed for a free org.
  - **Pooler host is project-specific:** new projects are NOT on `aws-0-…` (returns `Tenant or user not
    found`); this one is `aws-1-us-east-1.pooler.supabase.com` (`:6543` txn, `:5432` session). Always probe
    with a real `psql select` rather than assuming `aws-0`. Direct host `db.<ref>.supabase.co` resolves
    IPv6 — fine for a local migrator, but a Railway server should use the IPv4 session pooler (`:5432`).
  - **`api-keys -o json` returns a bare list**, not `{"keys":[…]}` (the default/no-`-o` form is the dict).
  - **Transcript-leak care:** building DATABASE_URL strings inline puts the password mid-string where a
    trailing-value mask won't catch it — assemble secrets in a script writing to a 600 file, print only
    lengths/REDACTED.
- Verify done: `psql select` succeeded on direct + session-pooler + txn-pooler; all 4 keys non-empty;
  `.mcp.json` repointed + JSON-valid. Owed: nothing for this step (no app surface deployed).
- Flip call: ✅ provision complete for Supabase; Railway/Vercel intentionally held to their build steps.
- New durable patterns promoted to Converged lessons: Supabase-CLI region-enum/upgrade; org-create-first;
  probe-the-pooler-host (`aws-1`, not `aws-0`).
