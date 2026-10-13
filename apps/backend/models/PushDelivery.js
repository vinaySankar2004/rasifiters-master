const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// push_deliveries — one row per push attempt (notifications SPEC §5, D-C15; migration sql/010). Written only by
// services/pushDeliveryService.js. No associations — so it is NOT registered in models/index.js (the AppEvent
// pattern). push_token_id has no FK on purpose: tokens are pruned, the delivery record stays.
const PushDelivery = sequelize.define("PushDelivery", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    notification_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    push_token_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    platform: {
        type: DataTypes.STRING(16),
        allowNull: true
    },
    outcome: {
        type: DataTypes.STRING(16),
        allowNull: false
    },
    error_code: {
        type: DataTypes.STRING(64),
        allowNull: true
    }
}, {
    tableName: "push_deliveries",
    timestamps: false,
    underscored: true
});

module.exports = PushDelivery;
