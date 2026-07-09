import SwiftUI

// MARK: - Shared building blocks
// Faithful 1:1 port of the legacy iOS Summary cards (ios-mobile Features/Home/Helpers/AdminHomeHelpers.swift).

struct SummaryHeader: View {
    let title: String
    let subtitle: String
    let status: String
    let initials: String

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(Color(.label))
                Text("\(subtitle)")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }

            Spacer()

            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.appOrange, Color.appOrangeGradientEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 52, height: 52)
                Text(initials)
                    .font(.headline.weight(.bold))
                    .foregroundColor(.black)
            }
        }
    }
}

struct CardShell<Content: View, Background: View>: View {
    let background: Background
    var strokeColor: Color = Color(.white).opacity(0.35)
    var height: CGFloat = 240
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .frame(height: height, alignment: .topLeading)
            .background(
                ZStack {
                    background
                        .blur(radius: 12)
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(.white).opacity(0.25))
                        .background(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .fill(Color(.systemBackground).opacity(0.3))
                        )
                }
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(strokeColor, lineWidth: 1)
            )
            .shadow(color: Color(.black).opacity(0.06), radius: 10, x: 0, y: 6)
    }
}

struct PlaceholderCard: View {
    let title: String

    var body: some View {
        VStack(alignment: .center, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))
            ProgressView()
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
    }
}

// MARK: - Program progress

struct ProgramProgressCard: View {
    let progress: Int
    let elapsedDays: Int
    let totalDays: Int
    let remainingDays: Int
    let status: String

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Program Progress")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Spacer()
                    Text(status.uppercased())
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.appOrange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.appOrangeLight))
                }

                Spacer(minLength: 0)

                HStack {
                    Spacer()
                    ZStack {
                        CompletionRing(progress: progress)
                            .frame(width: 140, height: 140)
                        VStack(spacing: 6) {
                            Text("\(progress)%")
                                .font(.title.weight(.bold))
                                .foregroundColor(Color(.label))
                            Text("\(elapsedDays)/\(totalDays) days")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                    }
                    Spacer()
                }

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct CompletionRing: View {
    let progress: Int

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.black.opacity(0.5), lineWidth: 10)
            Circle()
                .trim(from: 0, to: CGFloat(max(min(Double(progress), 100), 0)) / 100.0)
                .stroke(
                    LinearGradient(
                        colors: [Color.appOrange, Color.appOrangeGradientEnd],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: 12, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
        }
    }
}

// MARK: - MTD metric cards

struct MTDParticipationCard: View {
    let active: Int
    let total: Int
    let pct: Double
    let change: Double

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("MTD Participation")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    Text("\(Int(pct))%")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))

                    Text("\(active)/\(total) members active")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                }

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    changeBadge
                    Text("vs prior MTD")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var changeBadge: some View {
        let isUp = change >= 0
        let color: Color = isUp ? .green : .red
        let symbol = isUp ? "arrow.up" : "arrow.down"
        return HStack(spacing: 4) {
            Image(systemName: symbol)
            Text(String(format: "%.1f%%", abs(change)))
        }
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .foregroundColor(color)
        .cornerRadius(10)
    }
}

struct TotalWorkoutsCard: View {
    let total: Int
    let change: Double

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Total workouts")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                Spacer()

                Text("\(total)")
                    .font(.title2.weight(.bold))
                    .foregroundColor(Color(.label))

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    changeBadge
                    Text("vs prior MTD")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var changeBadge: some View {
        let isUp = change >= 0
        let color: Color = isUp ? .green : .red
        let symbol = isUp ? "arrow.up" : "arrow.down"
        return HStack(spacing: 4) {
            Image(systemName: symbol)
            Text(String(format: "%.1f%%", abs(change)))
        }
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .foregroundColor(color)
        .cornerRadius(10)
    }
}

struct TotalDurationCard: View {
    let hours: Double
    let change: Double

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Total duration")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                Spacer()

                Text("\(formattedHours) hrs")
                    .font(.title2.weight(.bold))
                    .foregroundColor(Color(.label))

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    changeBadge
                    Text("vs prior MTD")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var changeBadge: some View {
        let isUp = change >= 0
        let color: Color = isUp ? .green : .red
        let symbol = isUp ? "arrow.up" : "arrow.down"
        return HStack(spacing: 4) {
            Image(systemName: symbol)
            Text(String(format: "%.1f%%", abs(change)))
        }
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .foregroundColor(color)
        .cornerRadius(10)
    }

    private var formattedHours: String {
        let whole = Int(hours)
        if abs(hours - Double(whole)) < 0.05 {
            return "\(whole)"
        }
        return String(format: "%.1f", hours)
    }
}

struct AvgDurationCard: View {
    let minutes: Int
    let change: Double

    var body: some View {
        CardShell(
            background: Color(.systemBackground).opacity(0.9),
            strokeColor: Color(.systemGray4).opacity(0.6)
        ) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Avg duration")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))

                Spacer()

                Text("\(minutes) mins")
                    .font(.title2.weight(.bold))
                    .foregroundColor(Color(.label))

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    changeBadge
                    Text("vs prior MTD")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var changeBadge: some View {
        let isUp = change >= 0
        let color: Color = isUp ? .green : .red
        let symbol = isUp ? "arrow.up" : "arrow.down"
        return HStack(spacing: 4) {
            Image(systemName: symbol)
            Text(String(format: "%.1f%%", abs(change)))
        }
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .foregroundColor(color)
        .cornerRadius(10)
    }
}

// MARK: - Action cards

struct AddWorkoutCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 36, height: 36)
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.black)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color(.black).opacity(0.6))
                    .font(.subheadline.weight(.bold))
            }

            Text("Add workouts")
                .font(.title3.weight(.bold))
                .foregroundColor(.black)

            Text("Log one or many sessions at once and keep progress up to date.")
                .font(.subheadline)
                .foregroundColor(.black.opacity(0.65))
                .multilineTextAlignment(.leading)
                .padding(.bottom, 4)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                Capsule()
                    .fill(Color.appOrange)
                    .frame(height: 38)
                    .overlay(
                        Label("Log sessions", systemImage: "bolt.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 14)
                    )
            }
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color.appOrange, Color.appOrangeGradientEnd],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .mask(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.appOrange.opacity(0.3), lineWidth: 1)
        )
        .frame(height: 230, alignment: .topLeading)
    }
}

struct AddDailyHealthCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 36, height: 36)
                    Image(systemName: "bed.double.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color.white.opacity(0.7))
                    .font(.subheadline.weight(.bold))
            }

            Text("Log daily health")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            Text("Track sleep, diet quality, and steps for the day.")
                .font(.subheadline)
                .foregroundColor(Color.white.opacity(0.75))
                .multilineTextAlignment(.leading)
                .padding(.bottom, 4)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                Capsule()
                    .fill(Color.white.opacity(0.2))
                    .frame(height: 38)
                    .overlay(
                        Label("Log day", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                    )
            }
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color.appBlue, Color.appBlueLight],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .mask(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.appBlue.opacity(0.25), lineWidth: 1)
        )
        .frame(height: 230, alignment: .topLeading)
    }
}

// MARK: - Card ordering model

enum SummaryCardType: String, CaseIterable, Hashable {
    case addWorkout
    case addDailyHealth
    case programProgress
    case mtdParticipation
    case totalWorkouts
    case totalDuration
    case avgDuration
    case activityTimeline
    case distributionByDay
    case workoutTypes

    var span: Int {
        switch self {
        case .addWorkout, .addDailyHealth, .programProgress, .activityTimeline, .distributionByDay, .workoutTypes:
            return 2
        default:
            return 1
        }
    }

    var requiresFullWidth: Bool {
        switch self {
        case .programProgress, .activityTimeline, .addWorkout, .addDailyHealth, .distributionByDay, .workoutTypes:
            return true
        default:
            return false
        }
    }

    static var defaultOrder: [SummaryCardType] = [
        .programProgress,
        .addWorkout,
        .addDailyHealth,
        .mtdParticipation,
        .totalWorkouts,
        .totalDuration,
        .avgDuration,
        .activityTimeline,
        .distributionByDay,
        .workoutTypes
    ]
}

struct CardDropDelegate: DropDelegate {
    let item: SummaryCardType
    @Binding var items: [SummaryCardType]
    @Binding var dragging: SummaryCardType?
    let onReorder: () -> Void

    func dropEntered(info: DropInfo) {
        guard let dragging,
              dragging != item,
              let from = items.firstIndex(of: dragging),
              let to = items.firstIndex(of: item) else { return }
        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
            items.move(fromOffsets: IndexSet(integer: from), toOffset: to > from ? to + 1 : to)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        onReorder()
        return true
    }
}
