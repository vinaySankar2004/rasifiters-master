#!/usr/bin/env bash
# ICM deploy scope guardrail (CLAUDE.md §"Scope guardrail — TODO at deploy").
# Vercel + Render OAuth grant access to ALL projects/services in the account/workspace, so a stray
# `vercel`/`render` command could touch an unrelated project's prod. This PreToolUse hook (on Bash)
# restricts any vercel/render invocation to the rasifiters allow-list. Exit 2 = block (stderr shown
# to the model).
#
# Allow-list (see the `deploy` skill):
#   web:     Vercel project `rasifiters` = prj_Eqd5XmbgXDkRRhKJPASBOcIqKF6u
#            (team/scope `personal-vinayak` = team_VWBSWxM5pHvWjCraHUWB73v5; PROVISIONED 2026-06-29)
#   backend: Render web service `rasifiters-api` = srv-d90tgmv7f7vs73cudptg (PROVISIONED 2026-06-28)
#
# This hook BLOCKS any vercel/render command that names a non-rasifiters target: a `render` command
# referencing a `srv-…`/`dpl-…` id that is NOT ours, and (for vercel) any `--scope` that isn't the
# rasifiters team.

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only police vercel/render commands.
printf '%s' "$cmd" | grep -qiE '(^|[^[:alnum:]])(vercel|render)([^[:alnum:]]|$)' || exit 0

RENDER_SERVICE="srv-d90tgmv7f7vs73cudptg"   # rasifiters-api (the only Render service we own)

# Block a render command that names a Render service id which is NOT ours.
if printf '%s' "$cmd" | grep -qiE '(^|[^[:alnum:]])render([^[:alnum:]]|$)'; then
  bad=$(printf '%s' "$cmd" | grep -oE 'srv-[a-z0-9]+' | grep -vx "$RENDER_SERVICE" || true)
  if [ -n "$bad" ]; then
    echo "scope-guard: BLOCKED — render command references a non-rasifiters service id ($bad). Only $RENDER_SERVICE is allowed." >&2
    exit 2
  fi
fi

# The rasifiters Vercel team slug (set at web provisioning, 2026-06-29).
VERCEL_SCOPE="personal-vinayak"

# If a vercel --scope is present, it must match the rasifiters team.
if [ "$VERCEL_SCOPE" != "TODO_RASIFITERS_VERCEL_SCOPE" ] \
   && printf '%s' "$cmd" | grep -qiE '(^|[^[:alnum:]])vercel([^[:alnum:]]|$)' \
   && printf '%s' "$cmd" | grep -qiE -- '--scope([ =])' \
   && ! printf '%s' "$cmd" | grep -qiE -- "--scope([ =])$VERCEL_SCOPE"; then
  echo "scope-guard: BLOCKED — vercel --scope must be '$VERCEL_SCOPE'." >&2
  exit 2
fi

exit 0
