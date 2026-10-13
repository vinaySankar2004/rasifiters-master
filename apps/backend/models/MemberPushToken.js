const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const MemberPushToken = sequelize.define("MemberPushToken", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    device_token: {
        type: DataTypes.STRING(512),
        allowNull: false
    },
    platform: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "ios"
    },
    device_id: {
        type: DataTypes.STRING(256),
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    // notifications 0.4.0 (D-C11, sql/010): stamped by every registration (deviceService.registerDevice); the nightly
    // pg_cron prune drops rows unseen for 60 days. device_id (above) is the install id — partial unique index
    // uniq_member_push_tokens_device_id (WHERE device_id IS NOT NULL).
    last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: "member_push_tokens",
    timestamps: false,
    underscored: true,
    indexes: [
        { unique: true, fields: ["device_token"] },
        { fields: ["member_id"] },
        { fields: ["platform"] },
        { fields: ["last_seen_at"] }
    ]
});

module.exports = MemberPushToken;
