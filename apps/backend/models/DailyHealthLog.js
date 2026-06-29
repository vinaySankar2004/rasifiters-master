const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const DailyHealthLog = sequelize.define("DailyHealthLog", {
    program_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: "programs",
            key: "id"
        }
    },
    member_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: "members",
            key: "id"
        }
    },
    log_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        primaryKey: true
    },
    sleep_hours: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true
    },
    food_quality: {
        type: DataTypes.SMALLINT,
        allowNull: true,
        field: "diet_quality"
    }
}, {
    tableName: "daily_health_logs",
    timestamps: true,
    underscored: true
});

module.exports = DailyHealthLog;
