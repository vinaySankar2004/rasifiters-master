const express = require("express");
const cors = require("cors");
// Load .env then .env.local (local overrides); on Render only env vars are set.
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });
const { connectDB } = require("./config/database");
require("./models/index");
const { errorHandler } = require("./middleware/errorHandler");
const { getAppConfig, blockUnversionedAndroid } = require("./middleware/versionGate");

const authRoutes = require("./routes/auth");
const memberRoutes = require("./routes/members");
const programRoutes = require("./routes/programs");
const membershipRoutes = require("./routes/memberships");
const inviteRoutes = require("./routes/invites");
const notificationRoutes = require("./routes/notifications");
const workoutRoutes = require("./routes/workouts");
const programWorkoutRoutes = require("./routes/programWorkouts");
const { workoutLogRouter, dailyHealthLogRouter } = require("./routes/logs");
const { v1Router: analyticsV1Routes, v2Router: analyticsV2Routes } = require("./routes/analytics");
const {
    metricsRouter: memberMetricsRoutes,
    historyRouter: memberHistoryRoutes,
    streaksRouter: memberStreaksRoutes,
    recentRouter: memberRecentRoutes
} = require("./routes/memberAnalytics");
// NOTE (faithful rebuild, in progress): the remaining route groups are mounted as each feature is
// documented (question-asker) + ported. Tracked in COVERAGE.md / specs/features/.

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

// app-config — the version gate (specs/features/app-config/SPEC.md v0.2.0). Public, always 200, cached
// 5 min (D-C2). Body = per-platform hard minimum + soft nudge from env; `min_ios_version` keeps its exact
// name/shape for the live iOS binary, the other 3 keys are additive (D-C4); unset/malformed env → null =
// nobody blocked (D-C3). Route kept inline (D-C1); the normalizers live in middleware/versionGate.js.
// Push (APNs/FCM) is owned by `notifications` + `auth`.
app.get("/api/app-config", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(getAppConfig());
});

// D-C5: header-less Android (the 1.0.0 builds) → 426 "Please update…" — a no-op unless
// BLOCK_UNVERSIONED_ANDROID=true (default off). Mounted AFTER app-config (never gated) and BEFORE every
// router. Request-id / request-log middleware must mount above app-config so these 426s are logged.
app.use("/api", blockUnversionedAndroid);

app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/program-memberships", membershipRoutes);
app.use("/api/program-memberships", inviteRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/program-workouts", programWorkoutRoutes);
app.use("/api/workout-logs", workoutLogRouter);
app.use("/api/daily-health-logs", dailyHealthLogRouter);
app.use("/api/analytics", analyticsV1Routes);
app.use("/api/analytics-v2", analyticsV2Routes);
app.use("/api/member-metrics", memberMetricsRoutes);
app.use("/api/member-history", memberHistoryRoutes);
app.use("/api/member-streaks", memberStreaksRoutes);
app.use("/api/member-recent", memberRecentRoutes);

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
