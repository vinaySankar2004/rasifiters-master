// importAuth.js — import legacy bcrypt credentials into Supabase Auth + backfill members.auth_user_id.
//
// Per member: resolve email (primary > any > synthesized placeholder), create an auth.users row with
// the legacy bcrypt `password_hash` imported (so passwords keep working — no forced reset), then set
// the new auth user id on the target members row. Idempotent: members already linked are skipped, and
// an email that already exists in Auth is linked rather than re-created.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { legacy, target } from "./db.js";
import { config } from "./config.js";

const admin = () =>
  createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

function placeholderEmail(username) {
  const local = String(username).toLowerCase().replace(/[^a-z0-9._-]/g, "") || "member";
  return `${local}@${config.placeholderDomain}`;
}

// All existing auth users, keyed by lowercase email → id (handles re-runs / pre-existing users).
async function loadAuthUsers(sb) {
  const byEmail = new Map();
  for (let page = 1; page < 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  return byEmail;
}

async function loadLegacyMembers() {
  const { rows } = await legacy().query(`
    SELECT m.id, m.username, m.first_name, m.last_name, m.status,
           (SELECT email FROM public.member_emails WHERE member_id = m.id AND is_primary = true
              ORDER BY created_at LIMIT 1) AS primary_email,
           (SELECT email FROM public.member_emails WHERE member_id = m.id
              ORDER BY is_primary DESC, created_at LIMIT 1) AS any_email,
           c.password_hash
    FROM public.members m
    LEFT JOIN public.member_credentials c ON c.member_id = m.id
    ORDER BY m.created_at
  `);
  return rows;
}

async function alreadyLinked() {
  const { rows } = await target().query(
    `SELECT id, auth_user_id FROM public.members WHERE auth_user_id IS NOT NULL`
  );
  return new Map(rows.map((r) => [r.id, r.auth_user_id]));
}

async function link(memberId, authUserId) {
  await target().query(
    `UPDATE public.members SET auth_user_id = $1
       WHERE id = $2 AND auth_user_id IS DISTINCT FROM $1`,
    [authUserId, memberId]
  );
}

export async function importAuthUsers({ dryRun }) {
  const sb = admin();
  const [members, authByEmail, linked] = await Promise.all([
    loadLegacyMembers(),
    dryRun ? new Map() : loadAuthUsers(sb),
    alreadyLinked(),
  ]);

  const results = [];
  for (const m of members) {
    const usedPlaceholder = !m.primary_email && !m.any_email;
    const email = (m.primary_email || m.any_email || placeholderEmail(m.username)).toLowerCase();
    const base = { member_id: m.id, username: m.username, email, placeholder: usedPlaceholder };

    if (linked.has(m.id)) {
      results.push({ ...base, action: "skip", reason: "already-linked", auth_user_id: linked.get(m.id) });
      continue;
    }
    if (dryRun) {
      results.push({ ...base, action: "would-create", hasHash: !!m.password_hash });
      continue;
    }

    // Existing auth user with this email → link instead of recreate.
    const existing = authByEmail.get(email);
    if (existing) {
      await link(m.id, existing);
      results.push({ ...base, action: "link-existing", auth_user_id: existing });
      continue;
    }

    const payload = {
      email,
      email_confirm: true,
      user_metadata: { member_id: m.id, username: m.username, first_name: m.first_name, last_name: m.last_name },
      app_metadata: { migrated: true, placeholder_email: usedPlaceholder },
    };
    // Import the legacy bcrypt hash so the password keeps working. If a member somehow
    // has no credential row, fall back to a random password (login via reset only).
    if (m.password_hash) payload.password_hash = m.password_hash;
    else payload.password = randomUUID();

    const { data, error } = await sb.auth.admin.createUser(payload);
    if (error) {
      results.push({ ...base, action: "error", error: error.message, hasHash: !!m.password_hash });
      continue;
    }
    await link(m.id, data.user.id);
    authByEmail.set(email, data.user.id);
    results.push({ ...base, action: "create", auth_user_id: data.user.id, importedHash: !!m.password_hash });
  }
  return results;
}
