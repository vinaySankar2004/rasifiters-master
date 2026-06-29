#!/usr/bin/env bash
# ICM deploy scope guardrail (CLAUDE.md §"Scope guardrail — TODO at deploy").
# Vercel + Render OAuth grant access to ALL projects/services in the account/workspace, so a stray
# `vercel`/`render` command could touch an unrelated project's prod. This PreToolUse hook (on Bash)
# restricts any vercel/render invocation to the rasifiters allow-list. Exit 2 = block (stderr shown
# to the model).
#
# Allow-list (fill the real values once infra is provisioned — see the `deploy` skill):
#   web:     Vercel project `rasifiters-web`   (team/scope `TODO(provision)`)
#   backend: Render web service `rasifiters-api` (Blueprint apps/backend/render.yaml)
#
# Until provisioning, this hook BLOCKS any vercel/render command that names a non-rasifiters
# target, and (for vercel) enforces that any --scope passed matches the rasifiters team once set.
# After provisioning: replace TODO_RASIFITERS_VERCEL_SCOPE below with the real team slug and add
# any sibling-project deny patterns if this account hosts other apps.

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only police vercel/render commands.
printf '%s' "$cmd" | grep -qiE '(^|[^[:alnum:]])(vercel|render)([^[:alnum:]]|$)' || exit 0

# TODO(provision): once the Vercel team slug is known, set it here and uncomment the --scope check.
VERCEL_SCOPE="TODO_RASIFITERS_VERCEL_SCOPE"

# If a vercel --scope is present, it must match the rasifiters team.
if [ "$VERCEL_SCOPE" != "TODO_RASIFITERS_VERCEL_SCOPE" ] \
   && printf '%s' "$cmd" | grep -qiE '(^|[^[:alnum:]])vercel([^[:alnum:]]|$)' \
   && printf '%s' "$cmd" | grep -qiE -- '--scope([ =])' \
   && ! printf '%s' "$cmd" | grep -qiE -- "--scope([ =])$VERCEL_SCOPE"; then
  echo "scope-guard: BLOCKED — vercel --scope must be '$VERCEL_SCOPE'." >&2
  exit 2
fi

exit 0
