# Test-bed seeder (`tools/testbed/`)

Keeps a set of **dummy test accounts** and **3 test programs** populated with realistic recent data, so
that before a store push we can hand a tester **one login** that experiences all three program roles.

## Why

Store reviewers / beta testers need to exercise the app as **admin**, **logger**, and **member**. This
script sets up 3 programs where **`ava.rivera` is admin in one, logger in another, and member in the
third** — plus other dummy members filling each program with workout + daily-health data so charts and
summaries look alive, and end dates pushed forward so nothing shows as expired.

**This is the account to give a store reviewer** (Google Play "Sign-in details", App Store demo account):

```
username: ava.rivera
password: <the shared test password>   (see TESTBED_PASSWORD below)
```

## Safety / policy

- **API-only.** The script talks exclusively to the live backend API (the same endpoints the apps use).
  It never runs SQL against the DB — this respects `apps/backend/CLAUDE.md`'s DB-write policy and keeps
  all validation/authorization intact.
- **No secrets in the repo** (this repo is public). The password comes from the `TESTBED_PASSWORD` env
  var; usernames / role matrix / program names are non-secret and live in `seed.mjs`.

## Usage

```bash
# Non-destructive refresh (DEFAULT) — top up the last 14 days of data + push end dates to today+90.
# Use this each time you say "refresh the testbed". Preserves the role setup + testers' in-progress state.
TESTBED_PASSWORD='<pw>' node tools/testbed/seed.mjs

# Destructive clean slate — delete every program the test members admin, rebuild the 3 programs, re-enroll
# everyone with their role, seed data, set end dates. Use for first setup or a full reset.
TESTBED_PASSWORD='<pw>' node tools/testbed/seed.mjs --reset
```

Optional env: `TESTBED_SEED_DAYS` (default 14), `TESTBED_END_DAYS` (default 90),
`TESTBED_API_BASE` (default the prod Render API).

## The role matrix (edit `PROGRAMS` in `seed.mjs` to change)

| Program | Admin | ava.rivera | Others |
|---|---|---|---|
| RaSi Winter Reset | ava.rivera | **admin** | mia (logger), zoe (member), ethan (member) |
| RaSi Spring Shred* | mason.w | **logger** | aria, lucas, liam (members) |
| RaSi Summer Strong | mia.patel | **member** | zoe (logger), ethan, mason (members) |

\* "RaSi Spring Shred" has `admin_only_data_entry = true`, so ava's **logger** role there is meaningful
(loggers/admins can log for others while plain members cannot).

## Idempotency

Re-runnable safely: enrollment checks current membership first; daily-health uses the batch UPSERT
endpoint; workout logs are inserted row-by-row and duplicates (409) are skipped.

## Known caveat

`liam.kim`'s login currently fails (his Supabase Auth password isn't the shared test password). The
script logs a warning and skips only his enrollment; everything else proceeds. Reset his password (Supabase
dashboard → Authentication → Users, or the app's Forgot-password flow) and re-run to include him.
