const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_preferences — one row per member (notifications SPEC §3.5, sql/011). NO row = the defaults (= the column
// defaults). No associations — NOT registered in models/index.js (the PushDelivery pattern). Upserts are raw SQL in
// services/notificationPreferenceService.js; this model serves the reads.
const NotificationPreference = sequelize.define("NotificationPreference", {
    member_id: { type: DataTypes.UUID, primaryKey: true },
    program: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    activity: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    reminders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    digest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    announcements: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    reminder_time: { type: DataTypes.TIME, allowNull: false, defaultValue: "19:00" },
    time_zone: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "notification_preferences",
    timestamps: false,
    underscored: true
});

module.exports = NotificationPreference;
