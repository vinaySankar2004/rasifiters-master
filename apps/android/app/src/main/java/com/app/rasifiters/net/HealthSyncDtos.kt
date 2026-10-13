package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive

// health-sync §3.2–3.4 — POST /api/health-sync/batch, GET|PUT /api/health-sync/state.

/** One batch item. Absent fields are omitted (explicitNulls=false): a deletion sends only kind + deleted + sample_id. */
@Serializable
data class HealthSyncItemDTO(
    val kind: String,
    @SerialName("program_id") val programId: String? = null,
    val date: String? = null,
    @SerialName("sample_id") val sampleId: String? = null,
    val origin: String? = null,
    @SerialName("workout_name") val workoutName: String? = null,
    val value: JsonPrimitive? = null,
    @SerialName("start_at") val startAt: String? = null,
    @SerialName("end_at") val endAt: String? = null,
    val deleted: Boolean? = null,
    val legacy: Boolean? = null,
)

@Serializable
data class HealthSyncBatchRequest(val integration: String, val items: List<HealthSyncItemDTO>)

@Serializable
data class HealthSyncItemResult(val index: Int, val status: String, val error: String? = null)

@Serializable
data class HealthSyncBatchResponse(
    val integration: String? = null,
    val results: List<HealthSyncItemResult> = emptyList(),
)

@Serializable
data class HealthSyncStateRow(
    val integration: String,
    @SerialName("program_id") val programId: String,
    val kind: String,
    @SerialName("review_done_at") val reviewDoneAt: String? = null,
    @SerialName("last_success_at") val lastSuccessAt: String? = null,
)

@Serializable
data class HealthSyncStateResponse(
    @SerialName("server_time") val serverTime: String? = null,
    val states: List<HealthSyncStateRow> = emptyList(),
)

@Serializable
data class HealthSyncStateEntry(
    @SerialName("program_id") val programId: String,
    val kind: String,
    @SerialName("review_done") val reviewDone: Boolean? = null,
    @SerialName("sync_success") val syncSuccess: Boolean? = null,
)

@Serializable
data class HealthSyncStatePut(val integration: String, val entries: List<HealthSyncStateEntry>)
