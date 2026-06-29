const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ProgramInvite = sequelize.define("ProgramInvite", {
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
    invited_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: "members",
            key: "id"
        }
    },
    invited_username: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    invited_email: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    token_hash: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
    },
    status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "pending",
        validate: {
            isIn: [["pending", "accepted", "declined", "expired", "revoked"]]
        }
    },
    max_uses: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    uses_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: "program_invites",
    timestamps: false,
    underscored: true
});

module.exports = ProgramInvite;
