// Notification categories — notifications SPEC §3.4 (the category rule). The ONE map: notification type → category +
// deep-link target, every per-category delivery setting (Android channel, the replace key; APNs thread = the category)
// and LEGACY_TYPES — the types every pre-inbox client already shows (iOS ≤ 1.5.0 (58), Android ≤ 1.1.0 (5), web before
// the inbox). Those clients turn ANY item on GET /unacknowledged or a plain stream into a blocking pop-up, so both legacy
// paths carry only LEGACY_TYPES (the legacy-feed rule). A new type is added HERE (category + target) and nowhere else;
// an unknown type counts as program / inbox.
const CATEGORIES = ["program", "activity", "reminders", "digest", "announcements"];

// D-N2 (c), 2026-10-13: switched OFF, these are never created for that member; program + announcements are still
// created (they stay in the inbox) but not pushed.
const DROP_WHEN_OFF = new Set(["activity", "reminders", "digest"]);

const TYPES = {
    "program.invite_received": { category: "program", target: "invites" },
    "program.member_joined": { category: "program", target: "program" },
    "program.role_changed": { category: "program", target: "program" },
    "program.admin_transferred": { category: "program", target: "program" },
    "program.member_left": { category: "program", target: "program" },
    "program.member_removed": { category: "program", target: "programs" },
    "program.updated": { category: "program", target: "program" },
    "program.deleted": { category: "program", target: "programs" },
    "activity.kudos_received": { category: "activity", target: "inbox" },
    "reminder.daily": { category: "reminders", target: "log_workout" },
    "digest.weekly": { category: "digest", target: "inbox" },
    "app.broadcast": { category: "announcements", target: "inbox" }
};
const FALLBACK = { category: "program", target: "inbox" };

// program.updated is deliberately NOT here: live binaries would pop up a blocking modal on every program edit.
const LEGACY_TYPES = new Set([
    "program.invite_received",
    "program.member_joined",
    "program.role_changed",
    "program.admin_transferred",
    "program.member_left",
    "program.member_removed",
    "program.deleted",
    "app.broadcast"
]);

// Android: the two channels every live build has (notifications §3.2) …
const CHANNEL_DEFAULT = "rasi_default";
const CHANNEL_INVITES = "rasi_invites";
const INVITE_CHANNEL_TYPES = new Set([
    "program.invite_received",
    "program.role_changed",
    "program.admin_transferred",
    "program.member_removed"
]);
// … plus one per new category, created only by the inbox-capable Android build. Android 1.1.0 posts a foreground
// push on the message's channel id and Android drops a post to a channel that doesn't exist, so these ids go ONLY to
// installations registered with `inbox: true` (member_push_tokens.supports_inbox — the per-device push rule).
// A channel gives the user per-category settings; it does NOT stack alerts per category in the tray (FCM has no
// group key) — Android's per-category stacking is not available.
const INBOX_CHANNELS = {
    activity: "rasi_activity",
    reminders: "rasi_reminders",
    digest: "rasi_digest",
    announcements: "rasi_announcements"
};
// Once-a-day / once-a-week kinds REPLACE the previous one on the device (FCM tag + APNs collapse id); the rest stack.
const REPLACE_CATEGORIES = new Set(["reminders", "digest"]);

// The badge leaves these nudges out (they stay in `unread`): an ignored daily reminder must never make the app-icon
// badge climb (D-N14). Invites are counted through the pending-invite count instead (notificationInboxService).
const BADGE_EXCLUDED_TYPES = Object.keys(TYPES).filter((type) => REPLACE_CATEGORIES.has(TYPES[type].category));

const describe = (type) => TYPES[type] || FALLBACK;
const categoryFor = (type) => describe(type).category;
const targetFor = (type) => describe(type).target;
const inboxFields = (type) => ({ category: categoryFor(type), target: targetFor(type) });

const androidChannelFor = (type, supportsInbox) => {
    const inboxChannel = INBOX_CHANNELS[categoryFor(type)];
    if (supportsInbox && inboxChannel) return inboxChannel;
    return INVITE_CHANNEL_TYPES.has(type) ? CHANNEL_INVITES : CHANNEL_DEFAULT;
};

const replaceKeyFor = (type) => {
    const category = categoryFor(type);
    return REPLACE_CATEGORIES.has(category) ? category : null;
};

module.exports = {
    CATEGORIES,
    DROP_WHEN_OFF,
    LEGACY_TYPES,
    INBOX_CHANNELS,
    BADGE_EXCLUDED_TYPES,
    categoryFor,
    targetFor,
    inboxFields,
    androidChannelFor,
    replaceKeyFor
};
