import SwiftUI

enum WorkoutPopularityMetric: String, CaseIterable, Identifiable {
    case count
    case totalMinutes
    case avgMinutes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .count: return "Count"
        case .totalMinutes: return "Total Minutes"
        case .avgMinutes: return "Avg Minutes"
        }
    }

    var axisLabel: String {
        switch self {
        case .count: return "Workouts"
        case .totalMinutes: return "Minutes"
        case .avgMinutes: return "Avg mins"
        }
    }

    func value(for type: APIClient.WorkoutTypeDTO) -> Double {
        switch self {
        case .count:
            return Double(type.sessions)
        case .totalMinutes:
            return Double(type.total_duration)
        case .avgMinutes:
            return Double(type.avg_duration_minutes)
        }
    }

    func formattedValue(for type: APIClient.WorkoutTypeDTO) -> String {
        switch self {
        case .count:
            return "\(type.sessions)"
        case .totalMinutes:
            return "\(type.total_duration) mins"
        case .avgMinutes:
            return "\(type.avg_duration_minutes) mins"
        }
    }
}

func workoutPopularitySorted(
    types: [APIClient.WorkoutTypeDTO],
    metric: WorkoutPopularityMetric
) -> [APIClient.WorkoutTypeDTO] {
    types.sorted { metric.value(for: $0) > metric.value(for: $1) }
}

func workoutTypePaletteColor(for name: String) -> Color {
    let palette = Color.chartPalette
    var hash = 5381
    for u in name.unicodeScalars {
        hash = ((hash << 5) &+ hash) &+ Int(u.value)
    }
    let idx = abs(hash) % palette.count
    return palette[idx]
}
