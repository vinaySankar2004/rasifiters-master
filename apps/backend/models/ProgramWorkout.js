const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ProgramWorkout = sequelize.define("ProgramWorkout", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    program_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: "programs",
            key: "id"
        }
    },
    library_workout_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: "workouts_library",
            key: "id"
        }
    },
    workout_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    is_hidden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    tableName: "program_workouts",
    timestamps: true,
    underscored: true
});

module.exports = ProgramWorkout;
