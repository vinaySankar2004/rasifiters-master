import WidgetKit
import SwiftUI

private let workoutDeepLink = URL(string: "rasifiters://quick-add-workout")
private let healthDeepLink = URL(string: "rasifiters://quick-add-health")

struct SimpleEntry: TimelineEntry {
    let date: Date
}

struct StaticProvider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        completion(SimpleEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        let entry = SimpleEntry(date: Date())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct AddWorkoutWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        contentView
            .widgetURL(workoutDeepLink)
            .containerBackground(gradientBackground, for: .widget)
            .overlay(isFullColor ? cardBorder : nil)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private var contentView: some View {
        switch family {
        case .systemSmall:
            smallLayout
        case .systemMedium:
            mediumLayout
        default:
            smallLayout
        }
    }

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                iconCircle
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color.black.opacity(0.6))
            }

            Text("Add workout")
                .font(.headline.weight(.bold))
                .foregroundColor(.black)
                .lineLimit(1)

            Text("Quick add")
                .font(.caption)
                .foregroundColor(Color.black.opacity(0.65))
                .lineLimit(1)

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                Capsule()
                    .fill(isFullColor ? Color.appOrange : Color.white.opacity(0.18))
                    .frame(height: 28)
                    .overlay(
                        Label("Log", systemImage: "bolt.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(isFullColor ? .black : .white)
                            .padding(.horizontal, 10)
                    )
            }
        }
        .padding(0)
        .contentMargins(.zero)
    }

    private var mediumLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                iconCircle
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color.black.opacity(0.6))
                    .font(.subheadline.weight(.bold))
            }

            Text("Add workout session")
                .font(.title3.weight(.bold))
                .foregroundColor(.black)

            Text("Quick add a session for any program.")
                .font(.subheadline)
                .foregroundColor(Color.black.opacity(0.65))
                .multilineTextAlignment(.leading)
                .lineLimit(2)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                Capsule()
                    .fill(isFullColor ? Color.appOrange : Color.white.opacity(0.18))
                    .frame(height: 32)
                    .overlay(
                        Label("Log session", systemImage: "bolt.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(isFullColor ? .black : .white)
                            .padding(.horizontal, 14)
                    )
            }
        }
        .padding(EdgeInsets(top: 2.5, leading: 1.5, bottom: 2.5, trailing: 1.5))
    }

    private var iconCircle: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.2))
                .frame(width: 32, height: 32)
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.black)
        }
    }

    private var gradientBackground: LinearGradient {
        LinearGradient(
            colors: [Color.appOrange, Color.appOrangeGradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var cardBorder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.appOrange.opacity(0.3), lineWidth: 1)
    }

    private var isFullColor: Bool {
        renderingMode == .fullColor
    }
}

struct AddWorkoutWidget: Widget {
    private let kind = "AddWorkoutWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StaticProvider()) { _ in
            AddWorkoutWidgetView()
        }
        .configurationDisplayName("Add Workout")
        .description("Quick add a workout session")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private extension Color {
    static let appOrange = Color(red: 1.0, green: 0.65, blue: 0.2)
    static let appOrangeGradientEnd = Color(red: 1.0, green: 0.75, blue: 0.2)
    static let appBlue = Color(red: 0.24, green: 0.55, blue: 0.87)
    static let appBlueLight = Color(red: 0.42, green: 0.7, blue: 0.93)
}

struct AddDailyHealthWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        contentView
            .widgetURL(healthDeepLink)
            .containerBackground(healthGradient, for: .widget)
            .overlay(isFullColor ? healthBorder : nil)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder
    private var contentView: some View {
        switch family {
        case .systemSmall:
            smallLayout
        case .systemMedium:
            mediumLayout
        default:
            smallLayout
        }
    }

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                healthIconCircle
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color.white.opacity(0.7))
            }

            Text("Log health")
                .font(.headline.weight(.bold))
                .foregroundColor(.white)
                .lineLimit(1)

            Text("Quick add")
                .font(.caption)
                .foregroundColor(Color.white.opacity(0.75))
                .lineLimit(1)

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                Capsule()
                    .fill(Color.white.opacity(0.2))
                    .frame(height: 28)
                    .overlay(
                        Label("Log", systemImage: "plus")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                    )
            }
        }
        .padding(0)
        .contentMargins(.zero)
    }

    private var mediumLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                healthIconCircle
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color.white.opacity(0.7))
                    .font(.subheadline.weight(.bold))
            }

            Text("Log daily health")
                .font(.title3.weight(.bold))
                .foregroundColor(.white)

            Text("Quick add a health log for any program.")
                .font(.subheadline)
                .foregroundColor(Color.white.opacity(0.75))
                .multilineTextAlignment(.leading)
                .lineLimit(2)

            Spacer(minLength: 0)

            HStack(spacing: 10) {
                Capsule()
                    .fill(Color.white.opacity(0.2))
                    .frame(height: 32)
                    .overlay(
                        Label("Log day", systemImage: "plus")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                    )
            }
        }
        .padding(EdgeInsets(top: 2.5, leading: 1.5, bottom: 2.5, trailing: 1.5))
    }

    private var healthIconCircle: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.2))
                .frame(width: 32, height: 32)
            Image(systemName: "bed.double.fill")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
        }
    }

    private var healthGradient: LinearGradient {
        LinearGradient(
            colors: [Color.appBlue, Color.appBlueLight],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var healthBorder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.appBlue.opacity(0.25), lineWidth: 1)
    }

    private var isFullColor: Bool {
        renderingMode == .fullColor
    }
}

struct AddDailyHealthWidget: Widget {
    private let kind = "AddDailyHealthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StaticProvider()) { _ in
            AddDailyHealthWidgetView()
        }
        .configurationDisplayName("Log Daily Health")
        .description("Quick add a daily health log")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct RaSiFitersWidgetBundle: WidgetBundle {
    var body: some Widget {
        AddWorkoutWidget()
        AddDailyHealthWidget()
    }
}

#Preview(as: .systemSmall) {
    AddWorkoutWidget()
} timeline: {
    SimpleEntry(date: .now)
}

#Preview(as: .systemMedium) {
    AddWorkoutWidget()
} timeline: {
    SimpleEntry(date: .now)
}

#Preview(as: .systemSmall) {
    AddDailyHealthWidget()
} timeline: {
    SimpleEntry(date: .now)
}

#Preview(as: .systemMedium) {
    AddDailyHealthWidget()
} timeline: {
    SimpleEntry(date: .now)
}
