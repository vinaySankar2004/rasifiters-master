package com.app.rasifiters.core

import com.app.rasifiters.net.HealthTimelineResponse
import com.app.rasifiters.net.StepsStatsDTO
import com.app.rasifiters.net.WorkoutTypeDTO
import com.app.rasifiters.net.WorkoutTypeHighestParticipationDTO
import com.app.rasifiters.net.WorkoutTypeLongestDurationDTO
import com.app.rasifiters.net.WorkoutTypeMostPopularDTO

/**
 * The Lifestyle tab's analytics for one (program, "View as") scope, loaded by [ProgramContext.loadLifestyle]. Polish #31:
 * a part is null when its read failed with no previous value. The card then shows "—", never a fake 0 / "N/A" /
 * "No data" (those stay for genuinely empty loaded data).
 */
data class LifestyleData(
    val totalTypes: Int? = null,
    val mostPopular: WorkoutTypeMostPopularDTO? = null,
    val longestDuration: WorkoutTypeLongestDurationDTO? = null,
    val highestParticipation: WorkoutTypeHighestParticipationDTO? = null,
    val workoutTypes: List<WorkoutTypeDTO>? = null,
    val timeline: HealthTimelineResponse? = null,
    val steps: StepsStatsDTO? = null,
)

/** The 7 Lifestyle reads, each its own result — the `SummaryParts` pattern (A13 partial failures). */
internal class LifestyleParts(
    private val total: Result<Int>,
    private val mostPopular: Result<WorkoutTypeMostPopularDTO>,
    private val longest: Result<WorkoutTypeLongestDurationDTO>,
    private val participation: Result<WorkoutTypeHighestParticipationDTO>,
    private val types: Result<List<WorkoutTypeDTO>>,
    private val timeline: Result<HealthTimelineResponse>,
    private val steps: Result<StepsStatsDTO>,
) {
    fun errors(): List<Throwable> =
        listOf(total, mostPopular, longest, participation, types, timeline, steps).mapNotNull { it.exceptionOrNull() }

    /** Loaded parts win; a failed part keeps [prev] (this scope's previous value) when there is one, else stays null. */
    fun merge(prev: LifestyleData?) = LifestyleData(
        totalTypes = total.getOrElse { prev?.totalTypes },
        mostPopular = mostPopular.getOrElse { prev?.mostPopular },
        longestDuration = longest.getOrElse { prev?.longestDuration },
        highestParticipation = participation.getOrElse { prev?.highestParticipation },
        workoutTypes = types.getOrElse { prev?.workoutTypes },
        timeline = timeline.getOrElse { prev?.timeline },
        steps = steps.getOrElse { prev?.steps },
    )

    companion object { const val COUNT = 7 }
}
