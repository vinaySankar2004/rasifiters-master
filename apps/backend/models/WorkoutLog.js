const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const WorkoutLog = sequelize.define("WorkoutLog", {
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
    program_workout_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: "program_workouts",
            key: "id"
        }
    },
    log_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        primaryKey: true
    },
    duration: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: "workout_logs",
    timestamps: true,
    underscored: true
});

module.exports = WorkoutLog;
