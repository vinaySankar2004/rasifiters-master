#!/usr/bin/env bash
# render-env.sh — manage env vars on the rasifiters-api Render service via the REST API.
#
# Auth: reads $RENDER_API_KEY from the environment (set once in ~/.zshenv — a personal Render
#   API key, `rnd_…`, from Render → Account Settings → API Keys). The key is NEVER committed;
#   this script only references the env var. See ENV_RUNBOOK.md §1–2.
# Scope: hard-pinned to the single rasifiters service id (matches .claude/hooks/deploy-scope-guard.sh).
#
# Usage:
#   tools/render-env.sh list                 # list all env-var KEYS (no values)
#   tools/render-env.sh get   KEY            # print one value
#   tools/render-env.sh set   KEY VALUE      # upsert one var (merge — leaves others untouched)
#   tools/render-env.sh set   KEY -          # upsert, reading VALUE from stdin (for secrets)
#   tools/render-env.sh deploy               # trigger a deploy (apply env changes)
#   tools/render-env.sh status               # latest deploy id + status
set -euo pipefail

SVC="srv-d90tgmv7f7vs73cudptg"          # rasifiters-api (the ONLY service this touches)
API="https://api.render.com/v1"
: "${RENDER_API_KEY:?RENDER_API_KEY is unset — add it to ~/.zshenv (see ENV_RUNBOOK.md).}"

auth=(-H "Authorization: Bearer $RENDER_API_KEY")
cmd="${1:-list}"

case "$cmd" in
  list)
    curl -s "${auth[@]}" "$API/services/$SVC/env-vars?limit=100" \
      | python3 -c "import json,sys; print('\n'.join(sorted(e['envVar']['key'] for e in json.load(sys.stdin))))" ;;
  get)
    K="${2:?usage: get KEY}" curl -s "${auth[@]}" "$API/services/$SVC/env-vars?limit=100" \
      | K="${2}" python3 -c "import json,sys,os; k=os.environ['K']; print(next((e['envVar']['value'] for e in json.load(sys.stdin) if e['envVar']['key']==k),'(unset)'))" ;;
  set)
    k="${2:?usage: set KEY VALUE|-}"; v="${3:?usage: set KEY VALUE|-}"
    [ "$v" = "-" ] && v="$(cat)"
    K="$k" V="$v" python3 -c "import json,os,urllib.request; \
body=json.dumps({'value':os.environ['V']}).encode(); \
req=urllib.request.Request('$API/services/$SVC/env-vars/'+os.environ['K'], data=body, method='PUT', \
headers={'Authorization':'Bearer '+os.environ['RENDER_API_KEY'],'Content-Type':'application/json'}); \
r=urllib.request.urlopen(req); print(os.environ['K'],'→ HTTP',r.status)" ;;
  deploy)
    curl -s -X POST "${auth[@]}" -H "Content-Type: application/json" -d '{"clearCache":"do_not_clear"}' \
      "$API/services/$SVC/deploys" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print('deploy',d.get('id'),'|',d.get('status'))" ;;
  status)
    curl -s "${auth[@]}" "$API/services/$SVC/deploys?limit=1" \
      | python3 -c "import json,sys; d=json.load(sys.stdin)[0]['deploy']; print(d['id'],'|',d['status'],'|',(d.get('commit') or {}).get('message','')[:60])" ;;
  *)
    echo "unknown command: $cmd (list|get|set|deploy|status)" >&2; exit 1 ;;
esac
