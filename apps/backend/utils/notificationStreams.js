// In-process SSE registry — see specs/features/notifications/SPEC.md §3 (F2: single-instance).
// Maps memberId → the Set of open SSE response streams; sendNotificationToMember writes the
// `event: notification` frame to each, evicting any stream that throws on write.
// 0.4.0 (D-C16): closeAllNotificationStreams ends every stream with a PLAIN close at shutdown (server.js SIGTERM) —
// never a frame: iOS 1.4.x decodes ANY data: frame as a notification. After it runs, a newly registered stream is
// closed at once, so a draining instance holds no stream open.
const streamsByMember = new Map();
let closing = false;

const registerNotificationStream = (memberId, res) => {
    if (closing) {
        res.end();
        return;
    }
    if (!streamsByMember.has(memberId)) {
        streamsByMember.set(memberId, new Set());
    }
    streamsByMember.get(memberId).add(res);
};

const removeNotificationStream = (memberId, res) => {
    const streams = streamsByMember.get(memberId);
    if (!streams) return;
    streams.delete(res);
    if (streams.size === 0) {
        streamsByMember.delete(memberId);
    }
};

const sendNotificationToMember = (memberId, payload) => {
    const streams = streamsByMember.get(memberId);
    if (!streams) return;
    const data = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of streams) {
        try {
            res.write(data);
        } catch (error) {
            removeNotificationStream(memberId, res);
        }
    }
};

// Returns how many streams it closed (logged by server.js).
const closeAllNotificationStreams = () => {
    closing = true;
    let closed = 0;
    for (const streams of streamsByMember.values()) {
        for (const res of streams) {
            try {
                res.end();
                closed += 1;
            } catch (_error) {
                // the socket is already gone
            }
        }
    }
    streamsByMember.clear();
    return closed;
};

module.exports = {
    registerNotificationStream,
    removeNotificationStream,
    sendNotificationToMember,
    closeAllNotificationStreams
};
