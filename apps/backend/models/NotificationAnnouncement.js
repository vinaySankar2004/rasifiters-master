const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// notification_announcements — the send-anytime composer's audit + schedule (notifications SPEC §3.8, the announcement
// rule; sql/011). Written by services/announcementService.js (create, cancel) and services/announcementDelivery.js
// (progress). No associations — NOT registered in models/index.js. No FK to notifications (the 90-day retention deletes
// those).
const NotificationAnnouncement = sequelize.define("NotificationAnnouncement", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    sender_member_id: { type: DataTypes.UUID, allowNull: true },
    target_kind: { type: DataTypes.STRING(16), allowNull: false },
    target_program_id: { type: DataTypes.UUID, allowNull: true },
    recipient_ids: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false },
    title_template: { type: DataTypes.TEXT, allowNull: false },
    body_template: { type: DataTypes.TEXT, allowNull: false },
    mode: { type: DataTypes.STRING(8), allowNull: false },
    send_date: { type: DataTypes.DATEONLY, allowNull: true },
    send_time: { type: DataTypes.TIME, allowNull: true },
    fallback_time_zone: { type: DataTypes.STRING(64), allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    recipient_count: { type: DataTypes.INTEGER, allowNull: false },
    sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    completed_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: "notification_announcements",
    timestamps: false,
    underscored: true
});

module.exports = NotificationAnnouncement;
