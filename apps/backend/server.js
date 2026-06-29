const express = require("express");
const cors = require("cors");
// Load .env then .env.local (local overrides); on Render only env vars are set.
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });
const { connectDB } = require("./config/database");
require("./models/index");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const memberRoutes = require("./routes/members");
const programRoutes = require("./routes/programs");
// NOTE (faithful rebuild, in progress): the remaining route groups are mounted as each feature is
// documented (question-asker) + ported. Tracked in COVERAGE.md / specs/features/. Remaining legacy mounts:
//   /api/program-memberships /api/workouts /api/program-workouts
//   /api/workout-logs /api/daily-health-logs /api/analytics /api/analytics-v2
//   /api/member-metrics /api/member-history /api/member-streaks /api/member-recent /api/notifications

const app = express();

app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://rasi-fiters.vercel.app",
        "https://rasifiters.com",
        "https://www.rasifiters.com"
    ],
    credentials: true
}));

app.get("/", (req, res) => {
    res.send("Rasi Fiters API is running!");
});

app.use(express.json());

app.get("/api/app-config", (req, res) => {
    res.json({
        min_ios_version: process.env.MIN_IOS_VERSION || null
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/programs", programRoutes);

app.get("/api/test", (req, res) => {
    res.json({
        message: "API is working!",
        version: "3.0.0",
        dbSchema: "Consolidated"
    });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5001;

const startServer = async () => {
    try {
        await connectDB();
        console.log("Database connected successfully");
        // Bind 0.0.0.0 explicitly — Render (and most PaaS) require it to route external traffic.
        app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();
