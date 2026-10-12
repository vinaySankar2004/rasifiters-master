// Staging-only guards — reliability-overhaul Phase 2 track B (DESIGN_BOARD §8; auth SPEC D-C13).
//
// The staging API (Render `rasifiters-api-staging`, APP_ENV=staging) runs this same code against the `staging`
// Postgres schema but the SAME Supabase project, so `auth.users` is shared with prod. These helpers make sure a
// staging request can never create, change or delete a REAL login: only staging accounts — an email whose local
// part is `<name>+stg` or `<name>+stg-<tag>` — may be touched. With APP_ENV unset (prod) every helper is a no-op,
// except the boot check, which only LOGS an error when a prod process is connected to the `staging` schema — it
// never refuses to boot there, so prod behaviour is unchanged.
const { AppError } = require("./response");

const STAGING_EMAIL_RE = /^[^\s@+]+\+stg(-[^\s@+]+)?@[^\s@]+\.[^\s@]+$/i;
// Our own domain (and any subdomain) has no MX record: a reset mail there hard-bounces at Resend — the SMTP sender
// prod shares.
const UNDELIVERABLE_RE = /@([^@\s]+\.)?rasifiters\.com$/i;
const STAGING_ROLE = "rasifiters_staging";
const REFUSAL =
    "Not allowed on staging: only +stg test accounts (name+stg@… or name+stg-tag@…) can be created or changed here.";

const isStaging = () => (process.env.APP_ENV || "").trim().toLowerCase() === "staging";

const isStagingEmail = (email) => STAGING_EMAIL_RE.test((email || "").trim());

// Throws 403 on staging unless `email` is a staging account. Never logs the email (PII).
function assertStagingAccount(email) {
    if (!isStaging() || isStagingEmail(email)) return;
    console.warn("[staging-guard] refused a login-level change for a non-+stg account");
    throw new AppError(403, REFUSAL);
}

// May this server send an auth email (password reset) to `email`? Always true off staging. On staging: only a
// staging account, and never our own MX-less domain (a bounce would hurt the sender prod relies on).
function mayEmailFromHere(email) {
    if (!isStaging()) return true;
    const ok = isStagingEmail(email) && !UNDELIVERABLE_RE.test((email || "").trim());
    if (!ok) console.warn("[staging-guard] skipped an auth email to a non-+stg or undeliverable address");
    return ok;
}

// Wrap the three admin calls that MUTATE auth.users, once at boot, on staging only. Callers keep their existing
// error handling: createUser / updateUserById run outside try/catch, so a refusal surfaces as the 403 above; every
// deleteUser call site is best-effort (try/catch), so a refused delete only skips the auth-user part while the
// staging rows are still removed. inviteUserByEmail / generateLink / mfa.deleteFactor (unused today) can mail or
// change ANY login without an email to check, so on staging they always refuse.
function guardAdminAuth(admin) {
    if (!isStaging()) return;
    const original = {
        createUser: admin.createUser.bind(admin),
        updateUserById: admin.updateUserById.bind(admin),
        deleteUser: admin.deleteUser.bind(admin),
        getUserById: admin.getUserById.bind(admin)
    };
    const assertUserIsStaging = async (uid) => {
        const { data, error } = await original.getUserById(uid);
        assertStagingAccount(error ? null : data?.user?.email);
    };
    admin.createUser = async (attributes = {}) => {
        assertStagingAccount(attributes.email);
        return original.createUser(attributes);
    };
    admin.updateUserById = async (uid, attributes = {}) => {
        await assertUserIsStaging(uid);
        if (attributes.email !== undefined) assertStagingAccount(attributes.email);
        return original.updateUserById(uid, attributes);
    };
    admin.deleteUser = async (uid, shouldSoftDelete) => {
        await assertUserIsStaging(uid);
        return original.deleteUser(uid, shouldSoftDelete);
    };
    const block = (name) => async () => {
        console.warn(`[staging-guard] refused admin.${name} (blocked on staging)`);
        throw new AppError(403, REFUSAL);
    };
    for (const name of ["inviteUserByEmail", "generateLink"]) {
        if (typeof admin[name] === "function") admin[name] = block(name);
    }
    if (typeof admin.mfa?.deleteFactor === "function") admin.mfa.deleteFactor = block("mfa.deleteFactor");
    console.log("[staging] APP_ENV=staging — login-change guard active");
}

// Boot check (one SELECT at boot; no request-path effect). Staging: refuse to boot unless the schema is `staging`
// AND the login role is rasifiters_staging (the owner role with search_path=staging would reach every prod table;
// a DATABASE_URL pasted into the wrong Render service then fails the deploy and Render keeps the previous one
// live). Prod (APP_ENV unset): never throws — it only logs a loud error if it finds itself on `staging`.
async function assertDatabaseSchema() {
    const staging = isStaging();
    let schema, usr;
    try {
        const { sequelize } = require("../config/database");
        const [rows] = await sequelize.query("SELECT current_schema() AS schema, current_user AS usr");
        ({ schema, usr } = rows?.[0] || {});
    } catch (err) {
        if (staging) throw err;
        console.error("[staging-guard] boot schema check skipped — the query failed:", err?.message);
        return;
    }
    if (staging) {
        if (schema !== "staging" || usr !== STAGING_ROLE) {
            throw new Error(`APP_ENV=staging but the database schema is "${schema}" and the user "${usr}" — DATABASE_URL must log in as ${STAGING_ROLE}`);
        }
        console.log(`[staging] database schema = staging, user = ${STAGING_ROLE}`);
        return;
    }
    if (schema === "staging") {
        console.error('[staging-guard] DATABASE_URL logs in as the staging role but APP_ENV is not "staging" — fix DATABASE_URL');
    }
}

module.exports = {
    isStaging,
    isStagingEmail,
    assertStagingAccount,
    mayEmailFromHere,
    guardAdminAuth,
    assertDatabaseSchema
};
