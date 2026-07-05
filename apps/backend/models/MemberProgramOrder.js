const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Per-member program-card order for the program-picker surfaces (composite key,
// positions 0..n-1 per member). Net-new post-parity table (sql/005) — written
// full-replace by programService.setProgramOrder, read via the getPrograms JOIN.
const MemberProgramOrder = sequelize.define("MemberProgramOrder", {
    member_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
            model: "members",
            key: "id"
        }
    },
    program_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: {
            model: "programs",
            key: "id"
        }
    },
    position: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: "member_program_order",
    timestamps: false,
    underscored: true
});

module.exports = MemberProgramOrder;
