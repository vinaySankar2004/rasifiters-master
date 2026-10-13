// push_deliveries writer — notifications SPEC §5 (0.4.0, D-C15). ONE bulkCreate per notification send. Fire-and-forget:
// a failed insert is logged (error name + Postgres code only — never the values) and swallowed, so delivery never
// depends on the record.
const PushDelivery = require("../models/PushDelivery");

async function recordDeliveries(rows) {
    if (!rows || rows.length === 0) return;
    try {
        await PushDelivery.bulkCreate(rows);
    } catch (err) {
        console.error("[push] delivery record failed: %s %s", err.name, err.parent?.code || "");
    }
}

module.exports = { recordDeliveries };
