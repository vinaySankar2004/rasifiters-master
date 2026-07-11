// RaSi Fiters — test-bed seeder / refresher.
//
// Purpose: keep a small set of DUMMY test accounts + 3 test programs populated with realistic recent
// data so that BEFORE a store push we can hand a tester one login (ava.rivera) that experiences all
// three program roles (admin / logger / member), with charts + summaries looking alive and no expired
// program.
//
// POLICY: this NEVER touches the DB directly. Everything goes through the live backend API (the same
// endpoints the apps use) — so all validation/authorization/business-logic is respected. See
// apps/backend/CLAUDE.md DB-write policy.
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
// See ./README.md.

const BASE = process.env.TESTBED_API_BASE || "https://rasifiters-api.onrender.com/api";
const PASSWORD = process.env.TESTBED_PASSWORD;
const SEED_DAYS = Number(process.env.TESTBED_SEED_DAYS || 14);
const END_DATE_DAYS = Number(process.env.TESTBED_END_DAYS || 90);
const MODE = process.argv.includes("--reset") ? "reset" : "refresh";

// ── Non-secret config (usernames + role matrix + program names). ava.rivera rotates admin→logger→member. ──
const MEMBERS = ["ava.rivera", "liam.kim", "mia.patel", "zoe.chen", "ethan.m", "aria.shah", "lucas.b", "mason.w"];

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
    roster: [ ["ava.rivera", "logger"], ["aria.shah", "member"], ["lucas.b", "member"], ["liam.kim", "member"] ],
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

// ── phases ──
async function loginAll() {
  const sessions = {};
  for (const u of MEMBERS) {
    const s = await login(u);
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

async function seedProgram(program, adminSession) {
  const details = await api("GET", `/program-memberships/details?programId=${program.id}`, adminSession.token);
  const active = (details.data || []).filter((m) => m.status === "active");

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
  log(`RaSi test-bed — mode=${MODE} · seedDays=${SEED_DAYS} · endDate=today+${END_DATE_DAYS} · base=${BASE}\n`);

  log("── LOGIN ──");
  const sessions = await loginAll();
  const ok = (u) => sessions[u]?.ok ? sessions[u] : null;

  if (MODE === "reset") {
    log("\n── CLEAR (delete programs admined by test members) ──");
    await clearAdminPrograms(sessions);

    log("\n── BUILD (create 3 programs + enroll roster) ──");
    for (const cfg of PROGRAMS) {
      const admin = ok(cfg.admin);
      if (!admin) { log(`  ✗ SKIP "${cfg.name}" — admin ${cfg.admin} not logged in`); continue; }
      const created = await api("POST", "/programs", admin.token, {
        name: cfg.name, status: "active", start_date: ymd(daysAgo(SEED_DAYS)), end_date: ymd(daysAhead(END_DATE_DAYS)),
      });
      if (!created.ok) { log(`  ✗ create "${cfg.name}" failed (${created.status})`); continue; }
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
      await seedProgram(program, admin);
      await extendEndDate(program, admin);
    }
  } else {
    log("\n── REFRESH (top up data + extend end dates; non-destructive) ──");
    for (const cfg of PROGRAMS) {
      const admin = ok(cfg.admin);
      if (!admin) { log(`  ✗ SKIP "${cfg.name}" — admin ${cfg.admin} not logged in`); continue; }
      const program = await findProgramByName(admin, cfg.name);
      if (!program) { log(`  ✗ "${cfg.name}" not found — run with --reset first`); continue; }
      log(`  ↻ "${cfg.name}" (${program.id})`);
      await seedProgram(program, admin);
      await extendEndDate(program, admin);
    }
  }

  await verify(sessions);
  log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
