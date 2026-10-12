const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// app_events — the observability event trail (observability SPEC §5; migration sql/007_app_events.sql).
// Append-only, no associations — so it is NOT registered in models/index.js; clientEventService requires it directly.
const AppEvent = sequelize.define("AppEvent", {
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
    occurred_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "client"
    },
    type: {
        type: DataTypes.STRING(64),
        allowNull: false
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: true
    },
    platform: {
        type: DataTypes.STRING(16),
        allowNull: true
    },
    app_version: {
        type: DataTypes.STRING(32),
        allowNull: true
    },
    app_build: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    request_id: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    props: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
    }
}, {
    tableName: "app_events",
    timestamps: false,
    underscored: true
});

module.exports = AppEvent;
