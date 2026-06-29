const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Workout = sequelize.define("Workout", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    workout_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        field: "name"
    }
}, {
    tableName: "workouts_library",
    timestamps: true,
    underscored: true
});

module.exports = Workout;
