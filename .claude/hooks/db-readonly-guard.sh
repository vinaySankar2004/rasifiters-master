#!/usr/bin/env bash
# ICM Supabase read-only guardrail (CLAUDE.md §"Database Write Policy" + the `supabase` skill).
# The `supabase` skill inspects the rasifiters Supabase Postgres via `psql` (read-only). This
# PreToolUse hook (on Bash) is the hard backstop for that policy: it blocks any `psql` command
# that carries an inline write/DDL keyword, redirecting to a numbered migration file. A
# `psql -f <migration.sql>` run carries no SQL keyword on the command line, so sanctioned
# migration runs pass through. Exit 2 = block (stderr shown to the model). Exit 0 = allow.
#
# Parsing + keyword matching are done in one python3 pass to get reliable \b word boundaries —
# BSD/macOS grep ERE lacks them, so `updated_at`/`created_at` etc. would false-match a bare grep.

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, re, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)  # unparseable input — do not block

# Only police commands that invoke psql (also catches `DBURL=...; psql ...` and wrappers).
if not re.search(r"\bpsql\b", cmd):
    sys.exit(0)

# Whole-word write/DDL keywords. \b boundaries keep updated_at / created_at / "description" safe.
WRITE = r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|REINDEX|VACUUM|REFRESH|COPY)\b"
if re.search(WRITE, cmd, re.IGNORECASE):
    sys.stderr.write(
        "db-readonly-guard: BLOCKED — inline psql write/DDL is not allowed. "
        "Author a numbered migration in apps/backend/sql/ "
        "(idempotent IF NOT EXISTS / ON CONFLICT), have the user review it, then run it with "
        "`psql -f <migration.sql>` (file runs are allowed). See the `supabase` skill.\n"
    )
    sys.exit(2)

sys.exit(0)
'
