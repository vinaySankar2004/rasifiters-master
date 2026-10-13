// Delivery channels — notifications SPEC §3.7 (the content seam). Pipeline: content source → trigger → preferences →
// channel (DESIGN_BOARD §9 Direction). The stored notification + recipient rows ARE the inbox; a channel delivers one
// stored notification after its write commits:
//   inbox — the live in-app copy over the SSE registry, to every inbox recipient (the legacy filter lives there)
//   push  — APNs + FCM, only to recipients whose category switch is on (D-N2 c)
// A later channel (email) is one more entry with the same deliver({ payload, recipientIds, pushRecipientIds }) shape and
// its own recipient rule; nothing upstream changes. No email / AI code here.
const { sendNotificationToMember } = require("./notificationStreams");
const { sendPushToMembers } = require("./pushNotifications");
const { logError } = require("./logError");

const inboxChannel = {
    name: "inbox",
    deliver: async ({ payload, recipientIds }) => {
        recipientIds.forEach((memberId) => sendNotificationToMember(memberId, payload));
    }
};

const pushChannel = {
    name: "push",
    deliver: async ({ payload, pushRecipientIds }) => {
        if (pushRecipientIds.length === 0) return; // switched off → no push and no push_deliveries row
        await sendPushToMembers(pushRecipientIds, {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            type: payload.type,
            programId: payload.program_id
        });
    }
};

const CHANNELS = [inboxChannel, pushChannel];

// Fire-and-forget: a channel failure is logged and never reaches the emitter (its write already committed).
const deliverToChannels = (delivery) => {
    for (const channel of CHANNELS) {
        Promise.resolve()
            .then(() => channel.deliver(delivery))
            .catch((err) => logError(`[notifications] ${channel.name} channel failed:`, err));
    }
};

module.exports = { deliverToChannels, CHANNELS };
