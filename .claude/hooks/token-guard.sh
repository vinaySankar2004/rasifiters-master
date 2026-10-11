#!/usr/bin/env bash
# ICM token guardrail (BRIEF §6 of the reliability initiative + CLAUDE.md "MCP Servers").
# All four service tokens live in gitignored .claude/settings.local.json `env`, so they sit in the
# environment of every Bash call. Reads with the read-only/scoped tokens run freely; this PreToolUse
# hook returns permissionDecision "ask" (the user approves each call) for:
#   1. anything that references SUPABASE_ADMIN_TOKEN (the full-access Supabase token),
#   2. anything that reads or edits .claude/settings.local.json (where every token value lives),
#   3. a bare environment dump (env / printenv / export -p / declare -x / set) that would print them,
#   4. a write-shaped curl (non-GET method or a request body) to the Render / Vercel / Supabase
#      management APIs, or tools/render-env.sh set|deploy — the REST twin of the MCP rule
#      "reads free, prod-mutating calls confirm". (tools/ops-get.sh is GET-only and passes.)
# It matches text, so it guards against accidents, not a determined bypass. Exit 0 always; the
# decision travels in the JSON on stdout (db-readonly-guard + deploy-scope-guard still hard-block).

input=$(cat)

printf '%s' "$input" | python3 -c '
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # unparseable input — do not block

tool = data.get("tool_name", "")
ti = data.get("tool_input", {}) or {}

def ask(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": "token-guard: " + reason,
    }}))
    sys.exit(0)

ADMIN = re.compile(r"SUPABASE_ADMIN_TOKEN", re.IGNORECASE)
LOCAL = re.compile(r"settings\.local\.json")

if tool == "Bash":
    cmd = ti.get("command", "")
    if ADMIN.search(cmd):
        ask("this command uses SUPABASE_ADMIN_TOKEN (full access to the rasifiters Supabase project). Approve only a deliberate, named change.")
    if LOCAL.search(cmd):
        ask("this command touches .claude/settings.local.json, which holds every service token.")
    if re.search(r"(^|[;&|(`]|\$\()\s*(env|printenv|export\s+-p|declare\s+-[a-zA-Z]*x[a-zA-Z]*|set)\s*($|[;&|)>`])", cmd):
        ask("this command dumps the environment, which would print the service tokens.")
    if re.search(r"render-env\.sh\s+(set|deploy)\b", cmd):
        ask("tools/render-env.sh set/deploy changes the live rasifiters-api service.")
    # Judge each curl invocation on its own flags (split on pipes / separators, join continuations).
    for seg in re.split(r"[|;&\n]+", cmd.replace("\\\n", " ")):
        if not (re.search(r"\bcurl\b", seg) and re.search(r"api\.(render\.com|vercel\.com|supabase\.com)", seg)):
            continue
        as_get = re.search(r"(^|\s)(-G|--get)(\s|$)", seg)  # -G turns --data into query params
        write = re.search(r"(-X|--request)\s*[\x27\"]?(POST|PUT|PATCH|DELETE)\b", seg, re.IGNORECASE) \
            or (not as_get and re.search(r"(^|\s)(-d|--data(-raw|-binary|-urlencode)?|--json|-F|--form|-T|--upload-file)(\s|=|$)", seg))
        if write:
            ask("write-shaped call to a Render/Vercel/Supabase management API (non-GET or request body). Prod-mutating calls confirm each time.")
    sys.exit(0)

# File tools: reading or editing the token store.
paths = " ".join(str(ti.get(k, "")) for k in ("file_path", "path", "glob", "notebook_path"))
if LOCAL.search(paths):
    ask("this reads or edits .claude/settings.local.json, which holds every service token.")
if tool == "Grep" and ADMIN.search(str(ti.get("pattern", ""))):
    ask("searching for SUPABASE_ADMIN_TOKEN can surface the token value.")

sys.exit(0)
'
