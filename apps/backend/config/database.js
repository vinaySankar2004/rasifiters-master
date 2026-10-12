const { Sequelize } = require("sequelize");
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    },
    // observability D-C2: SQL logging OFF unless DB_LOG_SQL=true (local debugging only — queries carry usernames,
    // emails and push tokens as literals). Deliberately not keyed on NODE_ENV (unset on Render).
    logging: process.env.DB_LOG_SQL === "true" ? console.log : false,
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log("Database connected successfully.");
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };
