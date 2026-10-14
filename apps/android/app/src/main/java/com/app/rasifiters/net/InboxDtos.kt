package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The notification inbox contract — the inbox item, a page, the unread counts, read marks and preferences.

/** One inbox item: a `GET /notifications/inbox` row AND every `?inbox=1` stream frame. */
@Serializable
data class InboxItemDTO(
    val id: String,
    val type: String = "",
    /** program | activity | reminders | digest | announcements. */
    val category: String = "program",
    /** invites | program | programs | log_workout | inbox — where opening it goes (core/NotificationInbox.InboxTarget). */
    val target: String = "inbox",
    @SerialName("program_id") val programId: String? = null,
    @SerialName("actor_member_id") val actorMemberId: String? = null,
    val title: String = "",
    val body: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("read_at") val readAt: String? = null,
)

/** `GET /notifications/inbox?limit&before` — newest first; [nextCursor] is opaque (null = no older page). */
@Serializable
data class InboxPageDTO(
    val items: List<InboxItemDTO> = emptyList(),
    @SerialName("next_cursor") val nextCursor: String? = null,
)

/** `GET /inbox/unread-count` and the `POST /inbox/read` / `DELETE /inbox/…` answer. [badge] = unread items except invite items + pending
 *  invites — the "+" badge (Android draws no app-icon count: launcher dots are the OS's, the platform idiom). */
@Serializable
data class UnreadCountsDTO(
    val unread: Int = 0,
    @SerialName("pending_invites") val pendingInvites: Int = 0,
    val badge: Int = 0,
    /** Only on `POST /inbox/read`: how many items this call marked. */
    val updated: Int? = null,
    /** Only on `DELETE /inbox/:id` / `DELETE /inbox/all`: how many items this call removed. */
    val deleted: Int? = null,
)

/** `POST /inbox/read` — either [ids] (1–100) or [all] = true; the null one is omitted (explicitNulls = false). */
@Serializable
data class InboxReadRequest(
    val ids: List<String>? = null,
    val all: Boolean? = null,
)

/** `GET` / `PUT /notifications/preferences` answer. [reminderTime] = 24-hour "HH:MM" local; [timeZone] = the stored zone. */
@Serializable
data class NotificationPreferencesDTO(
    val categories: Map<String, Boolean> = emptyMap(),
    @SerialName("reminder_time") val reminderTime: String = "19:00",
    @SerialName("time_zone") val timeZone: String? = null,
)

/** `PUT /notifications/preferences` — partial: only the non-null fields are sent and changed. */
@Serializable
data class NotificationPreferencesUpdate(
    val categories: Map<String, Boolean>? = null,
    @SerialName("reminder_time") val reminderTime: String? = null,
)
