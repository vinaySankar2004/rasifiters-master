package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// ---- app-config §3 (GET /api/app-config — public, no auth) ----

@Serializable
data class AppConfigResponse(
    @SerialName("min_android_version_code") val minAndroidVersionCode: Int? = null,
    @SerialName("latest_android_version_code") val latestAndroidVersionCode: Int? = null,
)

// ---- observability §8 (POST /api/client-events) ----

/** One client event. [id] is a client UUID kept across retries (the server dedupes on it). */
@Serializable
data class ClientEvent(
    val id: String,
    val type: String,
    @SerialName("occurred_at") val occurredAt: String,
    @SerialName("request_id") val requestId: String? = null,
    val props: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class ClientEventBatch(val events: List<ClientEvent>)

@Serializable
data class ClientEventsResponse(val accepted: Int = 0, val dropped: Int = 0)

// ---- invites §3.1 (the one invite inbox) ----

/** GET /program-memberships/my-invites row; GET /all-invites (global admins) adds the invitee identity. */
@Serializable
data class PendingInviteDTO(
    @SerialName("invite_id") val inviteId: String,
    @SerialName("program_id") val programId: String,
    @SerialName("program_name") val programName: String? = null,
    @SerialName("program_status") val programStatus: String? = null,
    @SerialName("program_start_date") val programStartDate: String? = null,
    @SerialName("program_end_date") val programEndDate: String? = null,
    @SerialName("invited_by_name") val invitedByName: String? = null,
    @SerialName("invited_at") val invitedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("invited_username") val invitedUsername: String? = null,
    @SerialName("invited_member_name") val invitedMemberName: String? = null,
    @SerialName("invited_member_id") val invitedMemberId: String? = null,
)

/** PUT /program-memberships/invite-response — `action` accept | decline | revoke (global admins). */
@Serializable
data class InviteResponseRequest(
    @SerialName("invite_id") val inviteId: String,
    val action: String,
    @SerialName("block_future") val blockFuture: Boolean? = null,
)
