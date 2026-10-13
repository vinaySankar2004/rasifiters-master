const express = require("express");
const cors = require("cors");
// Load .env then .env.local (local overrides); on Render only env vars are set.
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });
const { connectDB } = require("./config/database");
require("./models/index");
const { assertDatabaseSchema } = require("./utils/stagingGuard");
const { requestLog } = require("./middleware/requestLog");
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
const clientEventRoutes = require("./routes/clientEvents");
const healthSyncRoutes = require("./routes/healthSync");
// NOTE (faithful rebuild, in progress): the remaining route groups are mounted as each feature is
// documented (question-asker) + ported. Tracked in COVERAGE.md / specs/features/.

const app = express();

// observability D-C7: trust exactly TWO proxy hops (Cloudflare edge → Render load balancer; measured on prod
// 2026-10-12: a request with no X-Forwarded-For logs xff_n=2, a spoofed one xff_n=3), so req.ip is the address
// Cloudflare saw and client-supplied entries stay ignored. Only the client-events per-client limiters read it
// today. Re-verify the hop count after any infra change with the request log's `xff_n` (observability SPEC §6).
app.set("trust proxy", 2);

// observability D-C1: structured request log + X-Request-Id. FIRST, so CORS preflights (and every later
// middleware's responses, incl. app-config's version-gate 426s) are logged too.
app.use(requestLog);

// Staging (auth SPEC D-C13): CORS_EXTRA_ORIGINS (comma-separated — the Vercel staging branch alias) is appended
// to the fixed list below. Unset (prod) → the list is exactly the hard-coded origins. A trailing "/" is dropped:
// a browser's Origin header never has one.
const extraCorsOrigins = (process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://rasi-fiters.vercel.app",
        "https://rasifiters.com",
        "https://www.rasifiters.com",
        ...extraCorsOrigins
    ],
    credentials: true,
    // observability D-C8: browsers cache the preflight for 2 h (Chrome's cap) — repeat web opens skip it.
    maxAge: 7200,
    // observability D-C8 (resolves auth F16): the web app may read Retry-After (auth D-C11 503s, client-events
    // 429s) and the X-Request-Id it should quote in error reports.
    exposedHeaders: ["Retry-After", "X-Request-Id"]
}));

app.get("/", (req, res) => {
    res.send("Rasi Fiters API is running!");
});

// observability D-C4: BEFORE the global express.json() — this router carries its own 64 kb parser (a body the
// global 100 kb parser read first would skip it). Also ahead of app-config's version gate on purpose: telemetry
// must arrive even from a build the gate blocks.
app.use("/api/client-events", clientEventRoutes);

// health-sync D-C10: also BEFORE the global express.json() — the batch route carries its own 256 kb parser (a 30-day
// catch-up exceeds the global 100 kb default). The router applies app-config's blockUnversionedAndroid itself, since this
// mount sits above the `/api` gate below.
app.use("/api/health-sync", healthSyncRoutes);

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
// notifications 0.4.0 (D-C16): the HTTP server handle, kept for the graceful shutdown at the end of this file.
let server = null;

const startServer = async () => {
    try {
        await connectDB();
        await assertDatabaseSchema(); // auth D-C13: staging must be on `staging`; prod only logs if it is
        console.log("Database connected successfully");
        // Bind 0.0.0.0 explicitly — Render (and most PaaS) require it to route external traffic.
        server = app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();

// notifications 0.4.0 (D-C16) — graceful shutdown. Render sends SIGTERM on every deploy / restart and kills the
// process 30 s later. Order: end every SSE stream with a PLAIN close (never a frame — iOS 1.4.x decodes any data:
// frame as a notification) → stop accepting connections and drop idle keep-alive sockets → exit 2 s after the server
// has closed (lets a just-dispatched push finish) → hard exit at 25 s whatever is still open.
const { closeAllNotificationStreams } = require("./utils/notificationStreams");
const SHUTDOWN_DRAIN_MS = 2000;
const SHUTDOWN_HARD_EXIT_MS = 25000;
let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const streamsClosed = closeAllNotificationStreams();
    console.log(JSON.stringify({ type: "shutdown", signal, sse_streams_closed: streamsClosed }));
    setTimeout(() => process.exit(0), SHUTDOWN_HARD_EXIT_MS).unref();
    if (!server) return process.exit(0);
    server.close(() => setTimeout(() => process.exit(0), SHUTDOWN_DRAIN_MS).unref());
    server.closeIdleConnections?.();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
