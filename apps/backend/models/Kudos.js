const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// kudos — one row per giver → recipient per recipient-local day (people SPEC §6; migration sql/012). Written only by
// services/kudosService.js, which requires this file directly. No associations — NOT registered in models/index.js
// (the PushDelivery / NotificationPreference pattern; FKs live in SQL).
const Kudos = sequelize.define("Kudos", {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    giver_id: { type: DataTypes.UUID, allowNull: false },
    recipient_id: { type: DataTypes.UUID, allowNull: false },
    program_id: { type: DataTypes.UUID, allowNull: false },
    kudos_date: { type: DataTypes.DATEONLY, allowNull: false },
    notification_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: "kudos",
    timestamps: false,
    underscored: true
});

module.exports = Kudos;
