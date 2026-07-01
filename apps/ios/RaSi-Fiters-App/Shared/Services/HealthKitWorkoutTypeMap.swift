import HealthKit

/// Maps every `HKWorkoutActivityType` to a RaSi Fiters `workouts_library` name.
///
/// Reconciliation policy (see specs/features/apple-health):
///   * ADDITIVE — the library keeps its existing curated names; Apple types with a close existing
///     equivalent REUSE that name (no duplicate), everything else uses Apple's Title-Case name which
///     `apps/backend/sql/004_seed_healthkit_workout_types.sql` seeds into the library.
///   * INVARIANT — every string returned here MUST exist in `workouts_library` after migration 004,
///     so a synced log resolves to a library-backed program workout (never an ad-hoc custom row).
///
/// Deployment target is iOS 18.6, so all activity-type cases are available (no `#available` guards).
enum HealthKitWorkoutTypeMap {

    /// The default-case name; also seeded into the library by migration 004.
    static let fallbackName = "Other Workout"

    static func workoutName(for activityType: HKWorkoutActivityType) -> String {
        switch activityType {
        // ── Reuse existing curated library rows (close equivalents, no new row) ──
        case .running:                          return "Running"
        case .cycling:                          return "Cycling"
        case .rowing:                           return "Rowing"
        case .boxing:                           return "Boxing"
        case .swimming:                         return "Swim"
        case .highIntensityIntervalTraining:    return "HIIT Intervals"
        case .yoga:                             return "Yoga Flow"
        case .pilates:                          return "Pilates Core"
        case .coreTraining:                     return "Core & Abs"
        case .functionalStrengthTraining:       return "Functional Training"
        case .cardioDance:                      return "Dance Cardio"
        case .mixedCardio:                      return "Cardio Endurance"
        case .stairClimbing:                    return "Stair Climber"
        case .flexibility:                      return "Stretching"
        case .preparationAndRecovery:           return "Mobility"
        case .cooldown:                         return "Mobility"

        // ── New library rows (Apple Title-Case names — must match migration 004 verbatim) ──
        case .americanFootball:                 return "American Football"
        case .archery:                          return "Archery"
        case .australianFootball:               return "Australian Football"
        case .badminton:                        return "Badminton"
        case .barre:                            return "Barre"
        case .baseball:                         return "Baseball"
        case .basketball:                       return "Basketball"
        case .bowling:                          return "Bowling"
        case .climbing:                         return "Climbing"
        case .cricket:                          return "Cricket"
        case .crossCountrySkiing:               return "Cross Country Skiing"
        case .crossTraining:                    return "Cross Training"
        case .curling:                          return "Curling"
        case .discSports:                       return "Disc Sports"
        case .downhillSkiing:                   return "Downhill Skiing"
        case .elliptical:                       return "Elliptical"
        case .equestrianSports:                 return "Equestrian Sports"
        case .fencing:                          return "Fencing"
        case .fishing:                          return "Fishing"
        case .fitnessGaming:                    return "Fitness Gaming"
        case .golf:                             return "Golf"
        case .gymnastics:                       return "Gymnastics"
        case .handCycling:                      return "Hand Cycling"
        case .handball:                         return "Handball"
        case .hiking:                           return "Hiking"
        case .hockey:                           return "Hockey"
        case .hunting:                          return "Hunting"
        case .jumpRope:                         return "Jump Rope"
        case .kickboxing:                       return "Kickboxing"
        case .lacrosse:                         return "Lacrosse"
        case .martialArts:                      return "Martial Arts"
        case .mindAndBody:                      return "Mind and Body"
        case .paddleSports:                     return "Paddle Sports"
        case .pickleball:                       return "Pickleball"
        case .play:                             return "Play"
        case .racquetball:                      return "Racquetball"
        case .rugby:                            return "Rugby"
        case .sailing:                          return "Sailing"
        case .skatingSports:                    return "Skating Sports"
        case .snowSports:                       return "Snow Sports"
        case .snowboarding:                     return "Snowboarding"
        case .soccer:                           return "Soccer"
        case .socialDance:                      return "Social Dance"
        case .softball:                         return "Softball"
        case .squash:                           return "Squash"
        case .stairs:                           return "Stairs"
        case .stepTraining:                     return "Step Training"
        case .surfingSports:                    return "Surfing Sports"
        case .swimBikeRun:                      return "Swim Bike Run"
        case .tableTennis:                      return "Table Tennis"
        case .taiChi:                           return "Tai Chi"
        case .tennis:                           return "Tennis"
        case .trackAndField:                    return "Track and Field"
        case .traditionalStrengthTraining:      return "Traditional Strength Training"
        case .transition:                       return "Transition"
        case .underwaterDiving:                 return "Underwater Diving"
        case .volleyball:                       return "Volleyball"
        case .walking:                          return "Walking"
        case .waterFitness:                     return "Water Fitness"
        case .waterPolo:                        return "Water Polo"
        case .waterSports:                      return "Water Sports"
        case .wheelchairRunPace:                return "Wheelchair Run Pace"
        case .wheelchairWalkPace:               return "Wheelchair Walk Pace"
        case .wrestling:                        return "Wrestling"

        // `.other` and any deprecated / future case fall back.
        default:                                return fallbackName
        }
    }
}
