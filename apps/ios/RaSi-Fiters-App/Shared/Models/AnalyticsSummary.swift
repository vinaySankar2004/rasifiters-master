import Foundation

struct AnalyticsSummary: Decodable {
    struct Range: Decodable {
        let current: PeriodRange
        let previous: PeriodRange
    }

    struct PeriodRange: Decodable {
        let start: String
        let end: String
    }

    struct Totals: Decodable {
        let logs: Int
        let logs_change_pct: Double
        let duration_minutes: Int
        let duration_change_pct: Double
        let avg_duration_minutes: Int
        let avg_duration_change_pct: Double
    }

    struct Members: Decodable {
        let total: Int
        let active: Int
        let at_risk: Int
    }

    struct TimelinePoint: Decodable {
        let date: String
        let workouts: Int
        let duration: Int
    }

    struct TopPerformer: Decodable {
        let member_id: String
        let member_name: String
        let workouts: Int
        let total_duration: Int
    }

    struct TopWorkoutType: Decodable {
        let workout_name: String
        let sessions: Int
        let duration: Int
    }

    let period: String
    let range: Range
    let totals: Totals
    let members: Members
    let timeline: [TimelinePoint]
    let distribution_by_day: [String: DayDistribution]
    let top_performers: [TopPerformer]
    let top_workout_types: [TopWorkoutType]

    struct DayDistribution: Decodable {
        let workouts: Int
        let duration: Int
    }
}
