const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const NotificationRecipient = sequelize.define("NotificationRecipient", {
    notification_id: {
        type: DataTypes.UUID,
        primaryKey: true
    },
    member_id: {
        type: DataTypes.UUID,
        primaryKey: true
    },
    acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: "notification_recipients",
    timestamps: false,
    underscored: true
});

module.exports = NotificationRecipient;
