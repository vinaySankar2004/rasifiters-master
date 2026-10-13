const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_send_keys — the never-send-twice ledger (notifications SPEC §3.6, D-N9; sql/011). A scheduled send is
// CLAIMED (INSERT … ON CONFLICT DO NOTHING RETURNING) before it is sent; only the caller whose insert returned the row
// sends. Safe across restarts and across the two instances a Render deploy briefly runs. At most once: a crash between
// claim and send skips that one send — never a duplicate. Kinds: reminder.daily (period = local date),
// digest.weekly (period = ISO week, e.g. 2026-W42), announcement (period = the announcement id).
// No associations — NOT registered in models/index.js.
const NotificationSendKey = sequelize.define("NotificationSendKey", {
    member_id: { type: DataTypes.UUID, primaryKey: true },
    kind: { type: DataTypes.STRING(32), primaryKey: true },
    period_key: { type: DataTypes.STRING(64), primaryKey: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "notification_send_keys",
    timestamps: false,
    underscored: true
});

const CLAIM_SQL = `
INSERT INTO notification_send_keys (member_id, kind, period_key)
SELECT t.member_id, :kind, t.period_key
FROM unnest(ARRAY[:memberIds]::uuid[], ARRAY[:periodKeys]::varchar[]) AS t(member_id, period_key)
ON CONFLICT DO NOTHING
RETURNING member_id, period_key`;

/** Claims every { memberId, periodKey } it can (ONE statement); returns the Set of "<memberId>|<periodKey>" THIS call won. */
NotificationSendKey.claim = async (kind, entries) => {
    const unique = [...new Map(entries.map((e) => [`${e.memberId}|${e.periodKey}`, e])).values()];
    if (unique.length === 0) return new Set();
    const [rows] = await sequelize.query(CLAIM_SQL, {
        replacements: {
            kind,
            memberIds: unique.map((e) => e.memberId),
            periodKeys: unique.map((e) => e.periodKey)
        }
    });
    return new Set(rows.map((row) => `${row.member_id}|${row.period_key}`));
};

/** Member ids already claimed for one kind + period (announcement progress). */
NotificationSendKey.claimedMemberIds = async (kind, periodKey) => {
    const rows = await NotificationSendKey.findAll({ where: { kind, period_key: periodKey }, attributes: ["member_id"], raw: true });
    return new Set(rows.map((row) => row.member_id));
};

module.exports = NotificationSendKey;
