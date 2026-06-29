const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ProgramInviteBlock = sequelize.define("ProgramInviteBlock", {
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
    member_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: "members",
            key: "id"
        }
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: "program_invite_blocks",
    timestamps: false,
    underscored: true,
    indexes: [
        {
            unique: true,
            fields: ["program_id", "member_id"]
        }
    ]
});

module.exports = ProgramInviteBlock;
