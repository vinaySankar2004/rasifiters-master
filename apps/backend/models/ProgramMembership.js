const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Join table between programs and members (no surrogate id; composite key).
const ProgramMembership = sequelize.define("ProgramMembership", {
    program_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
            model: "programs",
            key: "id"
        }
    },
    member_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
            model: "members",
            key: "id"
        }
    },
    joined_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "member"
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active"
    },
    left_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: "program_memberships",
    timestamps: false,
    underscored: true
});

module.exports = ProgramMembership;
