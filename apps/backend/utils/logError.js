// One log line for a caught error — observability D-C11 (resolves F8 for every file that adopts it). Prints the tag, the
// error's name, code and HTTP status, its message (≤ 200 chars, line breaks flattened so one error is one line) and its
// first two stack frames (code locations only) — NEVER the error object: a Sequelize error carries its SQL and bound
// parameter values (emails, usernames, push tokens) and a body-parser error the raw body. A Sequelize* error prints
// name + Postgres error code only (its message can echo inserted values).
// The one pattern every track reuses:   catch (err) { logError("[members] update failed:", err); … }
// Lives next to utils/response.js (auth reference_impl) — every feature already depends on auth, so no graph cycle.
const MAX_MESSAGE_CHARS = 200;
const MAX_FRAMES = 2;

// "at fn (file:line:col)" lines from err.stack — where it failed, never what it carried. The stack's header
// ("<name>: <message>", as many lines as the message has) is skipped whole.
const topFrames = (err) => {
    if (typeof err?.stack !== "string") return [];
    const headerLines = String(err.message ?? "").split("\n").length;
    return err.stack
        .split("\n")
        .slice(headerLines)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("at "))
        .slice(0, MAX_FRAMES);
};

function logError(tag, err) {
    const name = (err && typeof err.name === "string" && err.name) || "Error";
    if (name.startsWith("Sequelize")) {
        console.error("%s %s code=%s", tag, name, err.parent?.code || err.original?.code || "-");
        return;
    }
    const code = (err && (err.code ?? err.cause?.code)) || "-";
    const status = (err && (err.status ?? err.statusCode)) || "-";
    const message = typeof err?.message === "string"
        ? err.message.replace(/[\r\n]+/g, " ").slice(0, MAX_MESSAGE_CHARS)
        : "";
    const frames = topFrames(err);
    console.error("%s %s code=%s status=%s %s%s", tag, name, code, status, message,
        frames.length ? ` [${frames.join(" | ")}]` : "");
}

module.exports = { logError };
