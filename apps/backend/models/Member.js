const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Member = sequelize.define("Member", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
            this.setDataValue("first_name", value.trim());
        }
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
            this.setDataValue("last_name", value.trim());
        }
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    global_role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "standard",
        validate: {
            isIn: [["standard", "global_admin"]]
        }
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active",
        validate: {
            isIn: [["active", "disabled"]]
        }
    },
    auth_user_id: {
        // maps to auth.users.id (Supabase Auth) — see METHODOLOGY R1
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    member_name: {
        type: DataTypes.VIRTUAL,
        get() {
            const first = this.getDataValue("first_name") || "";
            const last = this.getDataValue("last_name") || "";
            return `${first} ${last}`.trim();
        },
        set(value) {
            const trimmed = (value || "").trim();
            if (!trimmed) {
                return;
            }
            const parts = trimmed.split(/\s+/);
            const first = parts.shift() || "";
            const last = parts.join(" ");
            if (first) {
                this.setDataValue("first_name", first);
            }
            if (last) {
                this.setDataValue("last_name", last);
            }
        }
    },
    date_joined: {
        type: DataTypes.VIRTUAL,
        get() {
            const createdAt = this.getDataValue("created_at");
            if (!createdAt) return null;
            return new Date(createdAt).toISOString().slice(0, 10);
        }
    }
}, {
    tableName: "members",
    timestamps: false,
    underscored: true
});

module.exports = Member;
