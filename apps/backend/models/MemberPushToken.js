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
    }
}, {
    tableName: "member_push_tokens",
    timestamps: false,
    underscored: true,
    indexes: [
        { unique: true, fields: ["device_token"] },
        { fields: ["member_id"] },
        { fields: ["platform"] }
    ]
});

module.exports = MemberPushToken;
