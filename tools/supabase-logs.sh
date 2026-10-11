#!/usr/bin/env bash
# supabase-logs.sh — query the rasifiters Supabase project's logs via the Management API (no OAuth).
#
# Auth: SUPABASE_ACCESS_TOKEN (read-only, project-scoped) from .claude/settings.local.json `env`.
#
# Log model (2026-10): ONE ClickHouse table `logs`; pick the stream with `source` — auth_logs,
#   auth_audit_logs, edge_logs, postgres_logs, supavisor_logs, postgrest_logs (discover with
#   `select distinct source from logs`). Nested fields: log_attributes['<key>']; raw JSON line:
#   event_message. The old `…/logs.all` endpoint and per-source tables (`auth_logs`) are gone
#   (410 / "table does not exist") — Supabase changelog 48235. The window is capped at 24 h.
#
# Usage: tools/supabase-logs.sh "<sql>" [start_iso] [end_iso]     (default window: last 24 h)
#   tools/supabase-logs.sh "select source, count(*) n from logs group by source"
#   tools/supabase-logs.sh "select timestamp, event_message from logs where source='auth_logs'
#                           and log_attributes['status'] >= '400' order by timestamp desc limit 20"
set -euo pipefail

REF="kpadxjekpiwfkqcxtrio"
sql=${1:?usage: supabase-logs.sh "<sql>" [start_iso] [end_iso]}
# Always send an explicit window — the endpoint answers "Backend error" when it is omitted.
end=${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
start=${2:-$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)}
args=(--data-urlencode "sql=$sql" --data-urlencode "iso_timestamp_start=$start"
      --data-urlencode "iso_timestamp_end=$end")

printf 'Authorization: Bearer %s' "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set}" \
  | curl -sS -m 60 -G -H @- -A "rasifiters-ops/1.0" \
      "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs" "${args[@]}"
echo
