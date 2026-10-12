# Phase 2 track A — plan-adversary verdict

# PLAN VERDICT: OBJECTIONS (6), all ADVISORY

Nothing here blocks the plan. I ran the plan's code in a scratch copy of `apps/backend` with the same deps (express 4.22.2, cors 2.8.6, body-parser 1.20.5, sequelize 6.37.8, Node 24). It behaved as the plan says, and E1 printed exactly the 10 expected lines. The six items below are ordered by importance.

1. **[ADVISORY] The sequencing pre-check skips shared files the brief flagged, and it never runs again before E4.**
   - Evidence: the pre-check lists only `server.js`, `.env.example`, `ENV_RUNBOOK.md`, `registry.json` and `REGISTRY.md`. The plan says `config/database.js`, `middleware/auth.js`, `sql/README.md` and `CONTEXT.md` "can be written at any time". The brief marks all four as shared with B, and B's login-change guard could land in `middleware/auth.js`. The plan's own reason for the pre-check ("file-level staging can't split hunks") applies to these files too.
   - The auth SPEC is also shared with B. The plan reserves auth 0.11.0 for A and 0.12.0 for B, but not the D-rule ID. A takes **D-C12**, and B is planning in parallel right now, so it may pick the same ID.
   - Failure scenario: B's implementer edits `middleware/auth.js` in the main tree while A is between step 9 and E4. A's E4 `git add apps/backend/middleware/auth.js` sweeps in B's unreviewed hunk. E5 pushes it, and Render auto-deploys it to prod.
   - Fix:
     - Add all 9 shared paths to the pre-check: the five above, plus `config/database.js`, `middleware/auth.js`, `sql/README.md`, `CONTEXT.md` and `specs/features/auth/SPEC.md`.
     - Run it again immediately before the E4 `git add`, and check that `git diff` on each shared file shows only A's hunks.
     - Reserve auth **D-C13** for B in the "B after A" list.

2. **[ADVISORY] One client can use up the whole global daily budget in about 13 minutes. SPEC F3 says only a "distributed flood" can.**
   - Evidence: the per-client cap is 30 requests per minute × 25 events = 750 events/min. The budget is 10,000 events per 24 h, so one IPv4 address or one /64 empties it in about 13.3 minutes. After that every client gets 429 with `Retry-After` up to 86,400 s.
   - Failure scenario (Phase 3): one device with a buggy sender loop takes out telemetry for every user for a day, possibly during the incident the telemetry is meant to explain.
   - Fix (simplest): in `clientEventService`, add a per-client daily event cap using the existing primitive, e.g. `createFixedWindowLimiter({ windowMs: DAY_MS, max: 1000, maxKeys: 10000 })` keyed by `clientKey(req.ip)` with cost = `rows.length`. Then fix the wording of F3.

3. **[ADVISORY] The plan enables `pg_cron` in prod, where the brief said to defer, and doesn't flag this for the user to approve.**
   - Evidence: brief open question 1 says "If yes, add …; otherwise defer." The plan's D-C6 notes that pg_cron is not enabled, and 007 runs `CREATE EXTENSION IF NOT EXISTS pg_cron` anyway. Board §7.2 does approve pg_cron retention, so this is defensible, but it is a new extension in the prod database.
   - Fix: add an item O5 so the user explicitly approves enabling pg_cron at the plan gate. The alternative is to split the cron section into a separate migration, 007b.

4. **[ADVISORY] E2 (the user runs 007 on prod) is not tied to impl-adversary sign-off.**
   - Evidence: E2 sits between E1 and E3, and nothing says impl-adversary must pass first. 007 uses `CREATE TABLE IF NOT EXISTS`.
   - Failure scenario: impl-adversary asks for a column change after 007 is already live. Editing 007 then does nothing in prod, so the fix needs an 008 or a manual drop.
   - Fix: state that E2 runs only after impl-adversary passes.

5. **[ADVISORY] The router-local body-parser error handler misses decompression errors.**
   - Evidence, from the scratch run: a POST with `Content-Encoding: gzip` and a non-gzip body raises a zlib `Z_DATA_ERROR` with status 400 but no `err.type`. Body-parser wraps it with `createError(400, error)`, which adds no `type`. The `typeof err.type === "string"` test sends it on to the global `errorHandler`, which returns **500** and prints the error.
   - The request is also logged with `"route":"/"`, because `baseUrl` resets as the error leaves the router (the F1 gap). That entry looks like a health-check route.
   - This contradicts SPEC §3.2 ("400 · 415 invalid_body … unsupported charset/encoding").
   - Fix: in `routes/clientEvents.js`, drop the `err.type` condition. Only body-parser can produce a 4xx error inside this router.

6. **[ADVISORY] The §8 sender contract can't rely on the client's own `X-Request-Id` if Render's edge rewrites it.**
   - Evidence: E6 already allows "X-Request-Id echoed" to fail (F8). If Render does rewrite the header, Phase 3 `client.error` events quoting the id the client sent will never match a log line.
   - Fix: change SPEC §8 to "quote the `X-Request-Id` from the response when present, else the one you sent."
   - Two smaller doc fixes:
     - The CONTEXT.md text "every response carries `X-Request-Id`" is wrong for `GET /` and `HEAD /`.
     - The 007 header's staging recipe should say "session pooler or direct connection (port 5432) only". On the transaction pooler (port 6543), `SET search_path` doesn't persist, so a re-run silently targets `public`.

**What I checked and found clean:**
- **Consumers:**
  - Nothing in the backend reads `req.ip`, `ips`, `protocol`, `hostname`, `secure` or `x-forwarded`, so `trust proxy` is safe.
  - Auth is applied per route (no `router.use`), so 401s get route templates.
  - `models/index.js` uses explicit requires, so an unregistered `AppEvent` is fine.
  - `resolveReqUser` is in the same module.
  - `AppError` already supports `code` and `retryAfter`.
  - No web, iOS or Android code sends `X-App-*` or reads the new headers.
  - No tooling or skill depends on the SQL log lines. The Phase 1b E8 watch uses Supabase logs plus Render `[auth]`/`[refresh]` text only.
- **Behavior, verified in the harness:**
  - Route templates for root, nested, 404 and preflight requests.
  - 413, 400 (malformed JSON) and 415 (`br` encoding) status codes.
  - `text/plain` and array bodies return 400 `invalid_batch`.
  - SSE carries `X-Request-Id` and logs `aborted:true` with status 200; a client abort before headers logs 499.
  - `trust proxy 1` resolves `req.ip` to the rightmost XFF entry.
  - `HEAD /` is skipped; a preflight returns 204 with `Max-Age` 7200 and `Expose-Headers` `Retry-After,X-Request-Id`.
  - `bulkCreate` generates `INSERT … ON CONFLICT DO NOTHING`, with values escaped correctly.
  - The smoke test has 48 checks locally and 28 on prod.
- **Live binaries:** every change is additive. Headers only, and the ETag doesn't change.
- **Board and SPEC rules:** the board §7/§8 rules are followed (schema-neutral migration, RLS on `public` only, no secrets). Deferring the error code is called out in D-C9. The member FK uses CASCADE, matching `member_push_tokens`. The DB user is `postgres.<ref>` on the session pooler, i.e. the table owner, so RLS doesn't block the backend.
- **Anchors:** every text anchor exists exactly once. That covers `server.js` (a)–(e), `auth.js` L222, the auth SPEC rows (L175/246/262/284/290), the ENV_RUNBOOK lines (L110/141-142/168), CONTEXT L23/L45-52, the sql README 004 row, the registry `"apple-health": {` line, and the REGISTRY rows.
- **Collisions with C:** C's hunks don't collide with A's in either order. C's 2a goes after the `errorHandler` require and A's (a) goes before it; C's `.env.example` change is an append.
- **Versioning:** auth 0.10.0 → 0.11.0 MINOR matches the git-version owned-interface rule.

Scratch files used for these checks: `/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/advA/` (`harness.js`, `harness2.js`, `harness3.js`).
