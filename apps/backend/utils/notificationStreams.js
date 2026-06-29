// In-process SSE registry — see specs/features/notifications/SPEC.md §3 (F2: single-instance).
// Maps memberId → the Set of open SSE response streams; sendNotificationToMember writes the
// `event: notification` frame to each, evicting any stream that throws on write.
const streamsByMember = new Map();

const registerNotificationStream = (memberId, res) => {
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

module.exports = {
    registerNotificationStream,
    removeNotificationStream,
    sendNotificationToMember
};
