import SwiftUI

/// Small capsule chip used by the Lifestyle workout-type stat cards ("Program to date").
/// Co-located in the legacy `AdminHomeHelpers.swift`; lifted to a shared component on the
/// Lifestyle-tab port (run 56) — the run-55 `GlassButton` situation.
struct AccentChip: View {
    let label: String
    let accent: Color

    var body: some View {
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(accent.opacity(0.12))
            .foregroundColor(accent)
            .clipShape(Capsule())
    }
}
