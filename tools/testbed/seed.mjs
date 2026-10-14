// RaSi Fiters — test-bed seeder / refresher.
//
// Purpose: keep a small set of DUMMY test accounts + 3 test programs populated with realistic recent
// data so that BEFORE a store push we can hand a tester one login (ava.rivera) that experiences all
// three program roles (admin / logger / member), with charts + summaries looking alive and no expired
// program.
//
// POLICY: this NEVER touches the DB directly. Everything goes through the live backend API (the same
// endpoints the apps use) — so all validation/authorization/business-logic is respected. See
// the repo-root CLAUDE.md DB-write policy.
//
// MODES:
//   node seed.mjs --reset     Destructive clean slate: delete every program the test members admin,
//                             recreate the 3 programs, (re)enroll everyone with their role, seed data,
//                             set end dates to today+90.
//   node seed.mjs             (default = --refresh) Non-destructive: find the 3 programs by name, top up
//                             the last SEED_DAYS of dummy data, push end dates to today+90. Preserves the
//                             role setup + testers' in-progress state. Use this for "refresh the testbed".
//
// SECRETS: the password is read from env TESTBED_PASSWORD (repo is public — never hardcode it).
//   TESTBED_PASSWORD='...' node tools/testbed/seed.mjs --reset
//
// STAGING: TESTBED_API_BASE=https://rasifiters-api-staging.onrender.com/api TESTBED_PASSWORD='...' \
//          TESTBED_STAGING_MAILBOX='you@gmail.com' node tools/testbed/seed.mjs --reset
//   Only against that exact base: wakes the free instance, and registers a missing test account (401 on login)
//   with the staging-only email you+stg-<username>@gmail.com (auth SPEC D-C13). Never against prod or a local API:
//   with TESTBED_STAGING_MAILBOX set and any other base, the script refuses to run.
//
// See ./README.md.

const BASE = process.env.TESTBED_API_BASE || "https://rasifiters-api.onrender.com/api";
// STAGING (auth SPEC D-C13) — matched POSITIVELY: wake + register run only against this exact base, never against
// prod or a local backend (whose DATABASE_URL may be the live prod DB).
const STAGING_BASE = "https://rasifiters-api-staging.onrender.com/api";
const IS_STAGING = BASE.replace(/\/+$/, "") === STAGING_BASE;
// A real inbox you own (no "+"), e.g. name@gmail.com. A missing staging account is registered as
// name+stg-<username>@gmail.com — the staging-only email shape the staging API accepts, delivered to that inbox so
// a staging password-reset test never bounces. Read only when an account has to be registered.
const STAGING_MAILBOX = (process.env.TESTBED_STAGING_MAILBOX || "").trim().toLowerCase();
const PASSWORD = process.env.TESTBED_PASSWORD;
const SEED_DAYS = Number(process.env.TESTBED_SEED_DAYS || 14);
const END_DATE_DAYS = Number(process.env.TESTBED_END_DAYS || 90);
const MODE = process.argv.includes("--reset") ? "reset" : "refresh";

// ── Non-secret config (usernames + role matrix + program names). ava.rivera rotates admin→logger→member. ──
// NOTE: liam.kim is intentionally excluded — his Supabase Auth password isn't the shared test password
// and can't be reset via the API; he's not needed. Re-add him here + in a roster below if ever reset.
const MEMBERS = ["ava.rivera", "mia.patel", "zoe.chen", "ethan.m", "aria.shah", "lucas.b", "mason.w"];

const PROGRAMS = [
  {
    name: "RaSi Winter Reset",
    admin: "ava.rivera",
    admin_only_data_entry: false,
    roster: [ ["mia.patel", "logger"], ["zoe.chen", "member"], ["ethan.m", "member"] ],
  },
  {
    // admin_only_data_entry ON so ava's LOGGER role is meaningful here (loggers/admins can log for others
    // while plain members cannot) — lets the tester feel the difference between logger and member.
    name: "RaSi Spring Shred",
    admin: "mason.w",
    admin_only_data_entry: true,
    roster: [ ["ava.rivera", "logger"], ["aria.shah", "member"], ["lucas.b", "member"] ],
  },
  {
    name: "RaSi Summer Strong",
    admin: "mia.patel",
    admin_only_data_entry: false,
    roster: [ ["ava.rivera", "member"], ["zoe.chen", "logger"], ["ethan.m", "member"], ["mason.w", "member"] ],
  },
];

const WORKOUTS = ["Running", "Cycling", "Strength Training", "Yoga", "Swimming", "HIIT", "Walking", "Rowing"];

// ── tiny helpers ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fnv(str) { let x = 2166136261; for (const c of String(str)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
function ymd(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d; }
function daysAhead(n) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d; }
const log = (...a) => console.log(...a);

async function api(method, path, token, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null; try { data = await res.json(); } catch { /* non-json */ }
      // Retry once on a cold-start 502/503/504.
      if ([502, 503, 504].includes(res.status) && attempt < 2) { await sleep(3000); continue; }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      if (attempt < 2) { await sleep(3000); continue; }
      return { ok: false, status: 0, data: { error: String(e) } };
    }
  }
}

async function login(username) {
  const r = await api("POST", "/auth/login/app", null, { identifier: username, password: PASSWORD });
  if (!r.ok) return { username, ok: false, status: r.status, error: r.data?.error };
  return { username, ok: true, token: r.data.access_token || r.data.token, memberId: r.data.member_id || r.data.user?.id };
}

// Staging only: register a missing test account through the public register endpoint (the path the apps use).
function namesFor(username) {
  const parts = username.split(/[._]/).filter(Boolean);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return { first_name: cap(parts[0] || username), last_name: cap(parts.slice(1).join(" ") || "Tester") };
}

async function bootstrap(username) {
  if (!/^[^\s@+]+@[^\s@]+\.[^\s@]+$/.test(STAGING_MAILBOX)) {
    log(`  ✗ ${username} — missing on staging; set TESTBED_STAGING_MAILBOX (a real inbox you own, no "+") to register it`);
    return false;
  }
  const [local, domain] = STAGING_MAILBOX.split("@");
  const { first_name, last_name } = namesFor(username);
  const r = await api("POST", "/auth/register", null, {
    username, password: PASSWORD, first_name, last_name, email: `${local}+stg-${username}@${domain}`,
  });
  if (r.ok) { log(`  ＋ ${username} registered on staging (+stg-${username} address)`); return true; }
  // api() retries a cold-start 5xx, but register isn't idempotent: if the first attempt landed, the retry answers
  // "taken". A working login means the account exists — count it as registered.
  if ((await login(username)).ok) { log(`  ＋ ${username} registered on staging (register said ${r.status}; login works)`); return true; }
  log(`  ✗ ${username} — REGISTER FAILED (${r.status} ${r.data?.error || ""})`);
  return false;
}

// Free Render instances sleep after 15 min idle and take ~1 min to wake: poll GET / (the health route) for up to
// 180 s until it answers with the API's own banner (not a platform placeholder page).
async function wake() {
  const root = BASE.replace(/\/api\/?$/, "/");
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(root, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (res.ok && text.includes("Rasi Fiters API is running!")) { log(`  ✓ ${root} awake`); return true; }
    } catch { /* still waking */ }
    await sleep(5000);
  }
  log(`  ✗ ${root} did not answer within 180 s`);
  return false;
}

// ── phases ──
async function loginAll() {
  const sessions = {};
  for (const u of MEMBERS) {
    let s = await login(u);
    // Staging only (D-C13): a missing test account is registered with a +stg email, then logged in again.
    if (!s.ok && s.status === 401 && IS_STAGING && (await bootstrap(u))) s = await login(u);
    sessions[u] = s;
    log(s.ok ? `  ✓ ${u} (id=${s.memberId})` : `  ✗ ${u} — LOGIN FAILED (${s.status} ${s.error || ""}) — will skip`);
  }
  return sessions;
}

async function clearAdminPrograms(sessions) {
  const deleted = new Set();
  for (const s of Object.values(sessions)) {
    if (!s.ok) continue;
    const progs = await api("GET", "/programs", s.token);
    for (const p of progs.data || []) {
      if (p.my_role === "admin" && !deleted.has(p.id)) {
        const del = await api("DELETE", `/programs/${p.id}`, s.token);
        if (del.ok) { deleted.add(p.id); log(`  🗑  deleted "${p.name}" (${p.id}) via ${s.username}`); }
        else log(`  ⚠  failed to delete "${p.name}" (${del.status})`);
      }
    }
  }
  if (deleted.size === 0) log("  (nothing to delete)");
  return deleted;
}

async function findProgramByName(session, name) {
  const progs = await api("GET", "/programs", session.token);
  return (progs.data || []).find((p) => p.name === name) || null;
}

// Locate a program across ALL test sessions, and report which session (if any) currently admins it.
// Needed because testers can transfer admin / remove the configured admin — looking the program up only
// through cfg.admin's own session then makes it look deleted when it is merely drifted.
async function locateProgram(sessions, name, preferredAdmin) {
  const order = [preferredAdmin, ...Object.keys(sessions).filter((u) => u !== preferredAdmin)];
  let program = null;
  for (const u of order) {
    const s = sessions[u];
    if (!s?.ok) continue;
    const p = await findProgramByName(s, name);
    if (!p) continue;
    program = program || p;
    if (p.my_role === "admin") return { program: p, adminSession: s };
  }
  return program ? { program, adminSession: null } : null;
}

async function ensureMembership(program, adminSession, memberSession, role) {
  const details = await api("GET", `/program-memberships/details?programId=${program.id}`, adminSession.token);
  const existing = (details.data || []).find((m) => m.member_id === memberSession.memberId);

  if (!existing || existing.status !== "active") {
    await api("POST", "/program-memberships/invite", adminSession.token, { program_id: program.id, username: memberSession.username });
    const inv = await api("GET", "/program-memberships/my-invites", memberSession.token);
    const mine = (inv.data || []).find((i) => i.program_id === program.id);
    if (mine) await api("PUT", "/program-memberships/invite-response", memberSession.token, { invite_id: mine.invite_id, action: "accept" });
    else { log(`    ⚠  no invite found for ${memberSession.username} in ${program.name}`); return false; }
  }
  if ((existing?.program_role || "member") !== role) {
    const upd = await api("PUT", "/program-memberships", adminSession.token, { program_id: program.id, member_id: memberSession.memberId, role });
    if (!upd.ok) log(`    ⚠  role set failed for ${memberSession.username}→${role} (${upd.status})`);
  }
  return true;
}

// Seeds ONLY the configured test accounts (testIds). A real account a tester added to a test program
// (e.g. the owner joining to try People/invites) is left alone — dummy data must never land on a real person.
async function seedProgram(program, adminSession, testIds) {
  const details = await api("GET", `/program-memberships/details?programId=${program.id}`, adminSession.token);
  const allActive = (details.data || []).filter((m) => m.status === "active");
  const active = allActive.filter((m) => testIds.has(m.member_id));
  for (const m of allActive.filter((x) => !testIds.has(x.member_id))) log(`    ⚠ non-test member left unseeded: ${m.username || m.member_id}`);

  // Workouts: row-by-row (skip 409 duplicates). ~2/3 of days per member for realism.
  let wOk = 0, wSkip = 0, wErr = 0;
  for (const m of active) {
    for (let d = 0; d < SEED_DAYS; d++) {
      if (fnv(`${m.member_id}|${d}|skip`) % 3 === 0) continue;
      const date = ymd(daysAgo(d));
      const workout = WORKOUTS[fnv(`${m.member_id}|${d}|w`) % WORKOUTS.length];
      const duration = 20 + (fnv(`${m.member_id}|${d}|dur`) % 41); // 20–60 min
      const r = await api("POST", "/workout-logs", adminSession.token, { program_id: program.id, member_id: m.member_id, workout_name: workout, date, duration });
      if (r.ok) wOk++; else if (r.status === 409) wSkip++; else { wErr++; if (wErr <= 3) log(`    ⚠ workout ${r.status}: ${JSON.stringify(r.data)}`); }
    }
  }

  // Health: batch upsert (idempotent), chunked at 150.
  const entries = [];
  for (const m of active) {
    for (let d = 0; d < SEED_DAYS; d++) {
      const date = ymd(daysAgo(d));
      entries.push({
        member_id: m.member_id,
        log_date: date,
        sleep_hours: Math.round((5 + (fnv(`${m.member_id}|${d}|sl`) % 36) / 10) * 10) / 10, // 5.0–8.5
        food_quality: 2 + (fnv(`${m.member_id}|${d}|fq`) % 4),                              // 2–5
        steps: 3000 + (fnv(`${m.member_id}|${d}|st`) % 11000),                              // 3000–14000
      });
    }
  }
  let hOk = 0, hErr = 0;
  for (let i = 0; i < entries.length; i += 150) {
    const chunk = entries.slice(i, i + 150);
    const r = await api("POST", "/daily-health-logs/batch", adminSession.token, { program_id: program.id, entries: chunk });
    if (r.ok) hOk += (r.data?.created || 0) + (r.data?.updated || 0); else { hErr++; log(`    ⚠ health batch ${r.status}: ${JSON.stringify(r.data)}`); }
  }
  log(`    seeded: workouts +${wOk} (skip ${wSkip}${wErr ? `, err ${wErr}` : ""}) · health ${hOk} rows (${active.length} members × ${SEED_DAYS}d)`);
}

// Create one configured program from scratch: program → roster with roles → seed → end date.
async function buildProgram(cfg, admin, ok, testIds) {
  const created = await api("POST", "/programs", admin.token, {
    name: cfg.name, status: "active", start_date: ymd(daysAgo(SEED_DAYS)), end_date: ymd(daysAhead(END_DATE_DAYS)),
  });
  if (!created.ok) { log(`  ✗ create "${cfg.name}" failed (${created.status})`); return; }
  const program = { id: created.data.id, name: cfg.name };
  log(`  ✓ "${cfg.name}" (${program.id}) — admin ${cfg.admin}`);
  for (const [uname, role] of cfg.roster) {
    const ms = ok(uname);
    if (!ms) { log(`    ⚠ skip ${uname} (not logged in)`); continue; }
    const done = await ensureMembership(program, admin, ms, role);
    if (done) log(`    + ${uname} → ${role}`);
  }
  if (cfg.admin_only_data_entry) await api("PUT", `/programs/${program.id}`, admin.token, { admin_only_data_entry: true });
  log("    seeding…");
  await seedProgram(program, admin, testIds);
  await extendEndDate(program, admin);
}

async function extendEndDate(program, adminSession) {
  const end = ymd(daysAhead(END_DATE_DAYS));
  const r = await api("PUT", `/programs/${program.id}`, adminSession.token, { end_date: end, status: "active" });
  if (r.ok) log(`    end date → ${end}`); else log(`    ⚠ end-date update failed (${r.status})`);
}

async function verify(sessions) {
  log("\n── VERIFY (final state) ──");
  const ava = sessions["ava.rivera"];
  if (!ava?.ok) { log("  (ava login failed — cannot verify)"); return; }
  const progs = await api("GET", "/programs", ava.token);
  for (const p of (progs.data || []).filter((x) => PROGRAMS.some((c) => c.name === x.name))) {
    log(`  • ${p.name} — ava's role: ${p.my_role} · members: ${p.active_members} · end: ${p.end_date}`);
  }
}

async function main() {
  if (!PASSWORD) { console.error("ERROR: set TESTBED_PASSWORD env var."); process.exit(1); }
  if (STAGING_MAILBOX && !IS_STAGING) { console.error("TESTBED_STAGING_MAILBOX is set but TESTBED_API_BASE is not the staging URL — refusing (would seed PROD)"); process.exit(1); }
  log(`RaSi test-bed — mode=${MODE} · seedDays=${SEED_DAYS} · endDate=today+${END_DATE_DAYS} · base=${BASE}\n`);
  if (IS_STAGING) {
    log("── WAKE (staging API) ──");
    if (!(await wake())) process.exit(1);
    log("");
  }

  log("── LOGIN ──");
  const sessions = await loginAll();
  const ok = (u) => sessions[u]?.ok ? sessions[u] : null;
  const testIds = new Set(Object.values(sessions).filter((s) => s?.ok).map((s) => s.memberId));

  if (MODE === "reset") {
    log("\n── CLEAR (delete programs admined by test members) ──");
    await clearAdminPrograms(sessions);

    log("\n── BUILD (create 3 programs + enroll roster) ──");
    for (const cfg of PROGRAMS) {
      const admin = ok(cfg.admin);
      if (!admin) { log(`  ✗ SKIP "${cfg.name}" — admin ${cfg.admin} not logged in`); continue; }
      await buildProgram(cfg, admin, ok, testIds);
    }
  } else {
    log("\n── REFRESH (top up data + extend end dates; non-destructive) ──");
    for (const cfg of PROGRAMS) {
      const wantAdmin = ok(cfg.admin);
      if (!wantAdmin) { log(`  ✗ SKIP "${cfg.name}" — admin ${cfg.admin} not logged in`); continue; }
      const located = await locateProgram(sessions, cfg.name, cfg.admin);
      // A tester can delete a configured program (store reviewers exercise admin "Delete program") — rebuild just that one.
      if (!located) { log(`  ＋ "${cfg.name}" missing — recreating`); await buildProgram(cfg, wantAdmin, ok, testIds); continue; }
      const { program } = located;
      let admin = located.adminSession;
      if (!admin) { log(`  ✗ "${cfg.name}" (${program.id}) — no test account admins it any more; run with --reset`); continue; }
      log(`  ↻ "${cfg.name}" (${program.id})`);
      // Admin drift: a tester can promote someone else and drop the configured admin. Repair by having
      // the CURRENT admin re-enroll + re-promote cfg.admin, then run the rest under cfg.admin's session.
      if (admin.username !== cfg.admin) {
        log(`    ⤿ admin drift — currently ${admin.username}; restoring ${cfg.admin} as admin`);
        await ensureMembership(program, admin, wantAdmin, "admin");
        admin = wantAdmin;
      }
      // Re-ensure the roster: manual testing can remove members (e.g. ava leaving a program),
      // and a refresh must restore the canonical role matrix, not just top up whoever is left.
      for (const [uname, role] of cfg.roster) {
        const ms = ok(uname);
        if (!ms) { log(`    ⚠ skip ${uname} (not logged in)`); continue; }
        await ensureMembership(program, admin, ms, role);
      }
      // Any leftover admin that is neither cfg.admin nor a roster entry stays put — flag it rather than
      // silently demoting a real person a tester may have added on purpose.
      const details = await api("GET", `/program-memberships/details?programId=${program.id}`, admin.token);
      for (const m of (details.data || []).filter((x) => x.status === "active" && x.program_role === "admin")) {
        if (m.member_id !== wantAdmin.memberId) log(`    ⚠ extra admin left in place: ${m.username || m.member_id}`);
      }
      await seedProgram(program, admin, testIds);
      await extendEndDate(program, admin);
    }
  }

  await verify(sessions);
  log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
