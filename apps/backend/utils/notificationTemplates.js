// Personalized notification content — notifications SPEC §3.7 (the content seam; D-N17). THE content seam of the
// pipeline content source → trigger → preferences → channel (DESIGN_BOARD §9 Direction). Every generated notification —
// daily reminder, weekly digest, kudos (People emits it), announcement merge fields — gets its title + body here, filled
// with the recipient's own data. Wording rotates deterministically: sha256(seedKey) picks the variant, so a retry for
// the same member + period renders the same words. A later AI provider implements the same async
// render(type, vars, seedKey) → { title, body } behind getContentProvider(); an email channel plugs in at
// utils/notificationChannels.js. No AI / email code here. Copy: ASCII apostrophes only (frontend-kit §3).
const crypto = require("crypto");

const NAME_FALLBACK = "friend";
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// {name} → vars.name; a name with no value is left as written (announcement validation rejects unknown names).
const fill = (text, vars) =>
    text.replace(/\{([a-z_]+)\}/g, (match, name) =>
        (vars[name] === undefined || vars[name] === null ? match : String(vars[name])));

const pick = (variants, seedKey) =>
    variants[crypto.createHash("sha256").update(String(seedKey)).digest().readUInt32BE(0) % variants.length];

const REMINDER = [
    { title: "Time to move, {first_name}", body: "Nothing logged yet today. Even 15 minutes counts." },
    { title: "Your workout is waiting", body: "Log today's workout in RaSi Fiters and keep your progress going." },
    { title: "A quick one today, {first_name}?", body: "Fit in a workout today, then log it in RaSi Fiters." }
];
const REMINDER_STREAK = [
    { title: "Keep your {streak}-day streak going", body: "Log a workout today to make it {next_streak} days." },
    { title: "{streak} days in a row, {first_name}!", body: "One workout today keeps your streak alive." },
    { title: "Don't break the chain", body: "You're on a {streak}-day streak. Log a workout today to keep it." }
];
const DIGEST_ACTIVE = [
    { title: "Your week in RaSi Fiters", body: "{workouts_text} on {days_text} last week{minutes_phrase}." },
    { title: "Weekly recap, {first_name}", body: "Last week you logged {workouts_text} on {days_text}{minutes_phrase}. Keep it up!" },
    { title: "Nice work last week, {first_name}", body: "{workouts_text} across {days_text}{minutes_phrase}. Here's to another strong week." }
];
const DIGEST_QUIET = [
    { title: "A fresh week, {first_name}", body: "No workouts logged last week. A new week starts today, so log one when you can." },
    { title: "New week, new start", body: "Last week was quiet. One workout this week gets you moving again." }
];
const DIGEST_STREAK_SUFFIX = " You're on a {streak}-day streak.";
const KUDOS = [
    { title: "{actor_first_name} gave you kudos", body: "For your workout {day_label}. Nice work, {first_name}!" },
    { title: "Kudos from {actor_first_name}", body: "{actor_first_name} cheered your workout {day_label}." },
    { title: "You got kudos, {first_name}!", body: "{actor_first_name} gave you kudos for your workout {day_label}." }
];

// type → (vars) → { variants, vars, suffix } — derived words (plurals, phrases) are computed once, here.
const TEMPLATES = {
    "reminder.daily": (vars) => ({
        variants: vars.streak >= 2 ? REMINDER_STREAK : REMINDER,
        vars: { ...vars, next_streak: vars.streak + 1 }
    }),
    "digest.weekly": (vars) => ({
        variants: vars.workouts > 0 ? DIGEST_ACTIVE : DIGEST_QUIET,
        vars: {
            ...vars,
            workouts_text: plural(vars.workouts, "workout"),
            days_text: plural(vars.active_days, "day"),
            minutes_phrase: vars.minutes > 0 ? ` (${vars.minutes} min)` : ""
        },
        suffix: vars.workouts > 0 && vars.streak >= 2 ? DIGEST_STREAK_SUFFIX : ""
    }),
    "activity.kudos_received": (vars) => ({ variants: KUDOS, vars })
};

/** { title, body } for a templated type; throws for a type without templates (a programming error). */
function renderTemplate(type, vars, seedKey) {
    const build = TEMPLATES[type];
    if (!build) throw new Error(`No notification template for ${type}`);
    const spec = build({ ...vars, first_name: vars.first_name || NAME_FALLBACK });
    const variant = pick(spec.variants, seedKey);
    return { title: fill(variant.title, spec.vars), body: fill(variant.body + (spec.suffix || ""), spec.vars) };
}

// The content-provider contract (the content seam): async render(type, vars, seedKey) → { title, body }. Today: the
// templates above.
const templateContentProvider = {
    name: "templates",
    render: async (type, vars, seedKey) => renderTemplate(type, vars, seedKey)
};
const getContentProvider = () => templateContentProvider;

// Announcements (D-N16): the sender's own title / body with these merge fields. {streak} renders 0 for a member with
// no current streak — the composer preview shows the sample recipient's real words before sending.
const MERGE_FIELDS = ["first_name", "streak", "program_name"];
const findMergeFields = (text) => [...new Set(Array.from(String(text).matchAll(/\{([a-z_]+)\}/g), (m) => m[1]))];
const renderMergeFields = (text, vars) => fill(text, { ...vars, first_name: vars.first_name || NAME_FALLBACK });

module.exports = { getContentProvider, renderTemplate, renderMergeFields, findMergeFields, MERGE_FIELDS };
