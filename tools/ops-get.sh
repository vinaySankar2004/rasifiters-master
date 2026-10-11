#!/usr/bin/env bash
# ops-get.sh — read-only GET against the Render / Vercel / Supabase management APIs (no OAuth).
#
# Auth: the token env vars Claude Code loads from gitignored .claude/settings.local.json `env`
#   (see .env.mcp.example). Values are piped to curl as a header — never on the command line, never
#   printed. GET-only by construction; writes go through the render MCP, tools/render-env.sh, the
#   dashboards, or a reviewed migration — each confirmed by the user (.claude/hooks/token-guard.sh).
#
# Usage: tools/ops-get.sh <render|vercel|supabase> '<path?query>'
#   render   → https://api.render.com    RENDER_API_KEY         account-wide; scope-guard pins srv ids
#   vercel   → https://api.vercel.com    VERCEL_TOKEN           rasifiters project only; teamId added
#   supabase → https://api.supabase.com  SUPABASE_ACCESS_TOKEN  read-only, rasifiters project only
#
# Examples:
#   tools/ops-get.sh render   '/v1/services/srv-d90tgmv7f7vs73cudptg'
#   tools/ops-get.sh vercel   '/v6/deployments?projectId=prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u&limit=5'
#   tools/ops-get.sh supabase '/v1/projects/kpadxjekpiwfkqcxtrio/config/auth'
set -euo pipefail

VERCEL_TEAM="team_VWBSWxM5pHvWjCraHUWB73v5"   # personal-vinayak (owns project rasifiters)

svc=${1:?usage: ops-get.sh <render|vercel|supabase> <path>}
path=${2:?usage: ops-get.sh <render|vercel|supabase> <path>}

case "$svc" in
  render)   base="https://api.render.com";   tok=${RENDER_API_KEY:?RENDER_API_KEY not set} ;;
  vercel)   base="https://api.vercel.com";   tok=${VERCEL_TOKEN:?VERCEL_TOKEN not set}
            case "$path" in
              *teamId=*) ;;
              *\?*) path="$path&teamId=$VERCEL_TEAM" ;;
              *)    path="$path?teamId=$VERCEL_TEAM" ;;
            esac ;;
  supabase) base="https://api.supabase.com"; tok=${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set} ;;
  *) echo "ops-get: unknown service '$svc' (render|vercel|supabase)" >&2; exit 2 ;;
esac

# -A: Supabase's Cloudflare rejects some default client user-agents (error 1010).
printf 'Authorization: Bearer %s' "$tok" | curl -sS -m 60 -H @- -A "rasifiters-ops/1.0" "$base$path"
echo
