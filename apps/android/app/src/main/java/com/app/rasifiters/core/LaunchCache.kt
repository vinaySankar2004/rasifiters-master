package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.net.Network
import com.app.rasifiters.net.ProgramDTO
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import java.io.File

@Serializable private data class CachedPrograms(val savedAt: Long, val programs: List<ProgramDTO>)
@Serializable private data class CachedSummary(val savedAt: Long, val summary: SummaryData)

/** Instant opens (board §6.5 / D-9): the last good program list + per-program Summary, PER MEMBER, in noBackupFilesDir
 *  (never backed up). Shown before the first network wave, rewritten after each good load (only while signed in — A14),
 *  deleted by the sign-out teardown. A missing / unreadable file is just a miss. */
class LaunchCache(context: Context) {
    data class Hit<T>(val data: T, val savedAt: Long)

    private val root = File(context.applicationContext.noBackupFilesDir, "launch_cache")

    suspend fun readPrograms(memberId: String): Hit<List<ProgramDTO>>? =
        read(file(memberId, PROGRAMS), CachedPrograms.serializer())?.let { Hit(it.programs, it.savedAt) }

    suspend fun writePrograms(memberId: String, programs: List<ProgramDTO>) =
        write(file(memberId, PROGRAMS), CachedPrograms.serializer(), CachedPrograms(System.currentTimeMillis(), programs))

    suspend fun readSummary(memberId: String, programId: String): Hit<SummaryData>? =
        read(file(memberId, "summary_$programId.json"), CachedSummary.serializer())?.let { Hit(it.summary, it.savedAt) }

    suspend fun writeSummary(memberId: String, programId: String, summary: SummaryData) =
        write(file(memberId, "summary_$programId.json"), CachedSummary.serializer(), CachedSummary(System.currentTimeMillis(), summary))

    suspend fun clear() { withContext(Dispatchers.IO) { root.deleteRecursively() } }

    private fun file(memberId: String, name: String) = File(File(root, memberId), name)

    private suspend fun <T> read(file: File, serializer: KSerializer<T>): T? = withContext(Dispatchers.IO) {
        if (!file.exists()) null else runCatching { Network.json.decodeFromString(serializer, file.readText()) }.getOrNull()
    }

    private suspend fun <T> write(file: File, serializer: KSerializer<T>, value: T) {
        withContext(Dispatchers.IO) {
            runCatching {
                file.parentFile?.mkdirs()
                val tmp = File(file.parentFile, file.name + ".tmp")
                tmp.writeText(Network.json.encodeToString(serializer, value))
                tmp.renameTo(file)
            }
        }
    }

    private companion object { const val PROGRAMS = "programs.json" }
}
