import Foundation

/// Which Lifestyle numbers are on screen: a program + the member they're for (nil = program-wide, a global admin's
/// "None"). Polish #31 / #10: a new key never shows the previous one's numbers.
struct LifestyleKey: Equatable {
    let programId: String
    let memberId: String?
}

/// The Lifestyle tab's data — the tab's own copy (polish #31/#34: never shared with Summary or the timelines). A nil
/// part = that read failed (its card shows "—"); a read that succeeded empty stays a value (the card's own empty text).
struct LifestyleSnapshot {
    let key: LifestyleKey
    var total: Int?
    var mostPopular: APIClient.WorkoutTypeMostPopularDTO?
    var longestDuration: APIClient.WorkoutTypeLongestDurationDTO?
    var highestParticipation: APIClient.WorkoutTypeHighestParticipationDTO?
    var types: [APIClient.WorkoutTypeDTO]?
    var timeline: [APIClient.HealthTimelinePoint]?
    var steps: APIClient.StepsStatsDTO?

    fileprivate var hasAnyPart: Bool {
        total != nil || mostPopular != nil || longestDuration != nil || highestParticipation != nil
            || types != nil || timeline != nil || steps != nil
    }

    /// A part that failed this time keeps its last good value for the same key (A13: the parts that loaded stay).
    fileprivate func keepingParts(of previous: LifestyleSnapshot?) -> LifestyleSnapshot {
        guard let previous, previous.key == key else { return self }
        var merged = self
        merged.total = total ?? previous.total
        merged.mostPopular = mostPopular ?? previous.mostPopular
        merged.longestDuration = longestDuration ?? previous.longestDuration
        merged.highestParticipation = highestParticipation ?? previous.highestParticipation
        merged.types = types ?? previous.types
        merged.timeline = timeline ?? previous.timeline
        merged.steps = steps ?? previous.steps
        return merged
    }
}

extension ProgramContext {
    /// Polish #31: the Lifestyle tab's seven reads in PARALLEL (the Summary recipe, `loadSummary`). Returns every part
    /// that loaded + the first failure; nil with no session / program, or when superseded (cancelled, or the program
    /// changed meanwhile). Writes no shared field — the tab keeps the snapshot in its own LoadState.
    @MainActor
    func loadLifestyle(memberId: String?) async -> (snapshot: LifestyleSnapshot, failure: Error?)? {
        guard let token = authToken, !token.isEmpty, let pid = programId else { return nil }
        let api = APIClient.shared
        let week = AdminHomeView.Period.week.apiValue
        async let totalCall = api.fetchWorkoutTypesTotal(token: token, programId: pid, memberId: memberId)
        async let popularCall = api.fetchWorkoutTypeMostPopular(token: token, programId: pid, memberId: memberId)
        async let longestCall = api.fetchWorkoutTypeLongestDuration(token: token, programId: pid, memberId: memberId)
        async let participationCall = api.fetchWorkoutTypeHighestParticipation(token: token, programId: pid, memberId: nil) // always program-wide
        async let typesCall = api.fetchWorkoutTypes(token: token, programId: pid, memberId: memberId)
        async let timelineCall = api.fetchHealthTimeline(token: token, period: week, programId: pid, memberId: memberId)
        async let stepsCall = api.fetchHealthSteps(token: token, programId: pid, memberId: memberId)
        var s = LifestyleSnapshot(key: LifestyleKey(programId: pid, memberId: memberId))
        var failure: Error?
        do { s.total = (try await totalCall).total_types } catch { failure = failure ?? error }
        do { s.mostPopular = try await popularCall } catch { failure = failure ?? error }
        do { s.longestDuration = try await longestCall } catch { failure = failure ?? error }
        do { s.highestParticipation = try await participationCall } catch { failure = failure ?? error }
        do { s.types = try await typesCall } catch { failure = failure ?? error }
        do { s.timeline = (try await timelineCall).buckets } catch { failure = failure ?? error }
        do { s.steps = try await stepsCall } catch { failure = failure ?? error }
        guard !Task.isCancelled, programId == pid else { return nil }
        return (s, failure)
    }
}

extension LoadState where Value == LifestyleSnapshot {
    /// Merges a `loadLifestyle` result into the CURRENT state (the Summary recipe, A13): every part → loaded; some →
    /// stale (failed parts keep their last good value for the same key, else "—"); none → failing (stale over kept
    /// data, else the error view).
    func merging(_ result: (snapshot: LifestyleSnapshot, failure: Error?)) -> LoadState {
        let merged = result.snapshot.keepingParts(of: value)
        guard let failure = result.failure else { return .fresh(merged) }
        guard let error = AppError(failure) else { return self }            // cancelled = superseded
        return merged.hasAnyPart ? .stale(merged, fetchedAt: Date(), error: error) : failing(with: error)
    }
}
