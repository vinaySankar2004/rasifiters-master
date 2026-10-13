package com.app.rasifiters.health

import java.time.LocalDate
import kotlin.coroutines.cancellation.CancellationException

/** health-sync §8 rule 9 — the once-per-member+device upgrade from the old build's client ledger. */
internal class HealthSyncUpgrade(private val store: HealthStore, private val manager: HealthConnectManager) {

    /** First v2 run for this member: if the old build left a ledger (H3 — only then), set the upgrade marker (rule 4
     *  then never uses the connect date) and DISCARD the changes token (this run reads workouts from today − 30 d).
     *  Queue the old build's confirmed lists as pending review_done (the rule-9 carry-over; sent by the runner until
     *  PUT /state accepts). Idempotent. */
    fun prepare() {
        if (store.v2Initialized) return
        if (store.ledgerEntries().isNotEmpty()) {
            store.upgradeMarker = true
            store.workoutChangesToken = null
        }
        val carried = HealthStore.Flow.entries.flatMap { f -> store.confirmedProgramIds(f).map { "$it|${f.kind}" } }
        if (carried.isNotEmpty()) store.pendingReviewDone = store.pendingReviewDone + carried
        store.v2Initialized = true
    }

    /** Old-ledger entries → `legacy` items, re-read in ONE paged window read (no per-id N+1). Entries Health no longer has
     *  are retired now. null = Health couldn't be read → the caller must not send workout adds this run (no double count). */
    suspend fun legacyItems(): List<PlannedItem>? {
        val entries = store.ledgerEntries()
        if (entries.isEmpty()) return emptyList()
        val oldest = runCatching { LocalDate.parse(entries.minOf { it.date }) }.getOrElse { LocalDate.now().minusDays(LEDGER_MAX_DAYS) }
        val records = try {
            manager.readWorkoutsSince(HealthDates.startOfDay(oldest.minusDays(1)))
        } catch (e: CancellationException) { throw e } catch (_: Exception) { return null }
        val byId = records.associateBy { it.metadata.id }
        return entries.mapNotNull { entry ->
            val record = byId[entry.sampleId]
            if (record == null) { store.ledgerRemove(entry.key); null } else HealthSyncItems.legacyWorkout(record, entry)
        }
    }

    /** Delete each old-ledger entry whose legacy item came back final (the marker stays). */
    fun retire(results: List<Pair<PlannedItem, String>>) {
        results.forEach { (item, status) -> val key = item.legacyKey; if (key != null && status != "skipped_locked") store.ledgerRemove(key) }
    }

    private companion object { const val LEDGER_MAX_DAYS = 45L }
}
