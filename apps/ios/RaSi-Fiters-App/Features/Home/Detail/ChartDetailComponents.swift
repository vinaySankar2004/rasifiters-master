import SwiftUI

// Shared chrome + axis/callout helpers for the Summary chart drill-down detail views
// (ActivityTimelineDetailView / DistributionByDayDetailView). Faithful 1:1 port of the legacy iOS
// helpers co-located in Detail/ActivityTimelineViews.swift + Detail/WorkoutDistributionViews.swift
// + the shared clamp() from Detail/MemberPickerOverviewView.swift. These lived in deferred legacy
// Detail files, so the foundation port (run 50) never pulled them in — ported now with the views
// (run-55/56 co-located-helper pattern). NOTE: DistributionPoint / distributionPoints / typeColor /
// barColor / ScrollableBarChart / DistributionChartOverlay already live in Tabs/SummaryChartCards.swift
// (run 54) — referenced here, NOT redefined. HealthCalloutView / HealthHeaderStats / GlassButton are
// intentionally NOT ported here (GlassButton landed run 55; the health variants belong to the future
// lifestyle-timeline detail run). Chart colors tokenized: .orange → appOrange(Strong), .purple → appPurple.

// MARK: - Daily-average header (activity timeline)

struct HeaderStats: View {
    let label: String
    let dailyAverage: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("DAILY AVERAGE")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                    Text(String(format: "%.0f", dailyAverage))
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.appOrange)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label.isEmpty ? "—" : label)
                        .font(.callout.weight(.medium))
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
        }
    }
}

struct HeaderHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

// MARK: - Tap callout bubble

struct CalloutView: View {
    let label: String
    let workouts: Int
    let active: Int?
    var showActive: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
            HStack {
                Circle().fill(Color.appOrange).frame(width: 6, height: 6)
                Text("Workouts: \(workouts)")
            }
            .font(.caption2)
            if showActive, let active {
                HStack {
                    Circle().fill(Color.appPurple).frame(width: 6, height: 6)
                    Text("Active: \(active)")
                }
                .font(.caption2)
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(.systemBackground))
                .shadow(radius: 4, y: 2)
        )
    }
}

// MARK: - Positioning helper

func clamp(_ value: CGFloat, min: CGFloat, max: CGFloat) -> CGFloat {
    Swift.max(min, Swift.min(max, value))
}

// MARK: - Axis / callout label helpers

func axisValues(for period: AdminHomeView.Period, startDate: Date, endDate: Date) -> [String] {
    switch period {
    case .week:
        return []
    case .month:
        return ["1", "8", "15", "22", "29"]
    case .year:
        return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    case .program:
        return programMonthLabels(start: startDate, end: endDate)
    }
}

func shortLabel(for value: String, period: AdminHomeView.Period) -> String {
    switch period {
    case .year, .program:
        return String(value.prefix(1))
    default:
        return value
    }
}

func programMonthLabels(start: Date, end: Date) -> [String] {
    var labels: [String] = []
    let cal = Calendar(identifier: .gregorian)
    guard start <= end else { return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] }
    var cursor = cal.date(from: cal.dateComponents([.year, .month], from: start)) ?? start
    let endMonth = cal.date(from: cal.dateComponents([.year, .month], from: end)) ?? end
    let df = DateFormatter()
    df.dateFormat = "MMM"
    while cursor <= endMonth {
        labels.append(df.string(from: cursor))
        cursor = cal.date(byAdding: .month, value: 1, to: cursor) ?? cursor
        if labels.count > 24 { break }
    }
    if labels.isEmpty {
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    }
    return labels
}

func calloutTitle(for point: APIClient.ActivityTimelinePoint, period: AdminHomeView.Period) -> String {
    calloutTitle(dateString: point.date, label: point.label, period: period)
}

func calloutTitle(dateString: String, label: String, period: AdminHomeView.Period) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(abbreviation: "UTC")

    // Try full ISO first
    if let date = ISO8601DateFormatter().date(from: dateString.contains("T") ? dateString : dateString + "T00:00:00Z") {
        return formatCalloutDate(date: date, period: period, formatter: formatter)
    }

    // Try yyyy-MM (month buckets)
    if dateString.count == 7, dateString.contains("-") {
        let components = dateString.split(separator: "-")
        if let year = Int(components[0]), let month = Int(components[1]) {
            var dc = DateComponents()
            dc.year = year
            dc.month = month
            dc.day = 1
            let cal = Calendar(identifier: .gregorian)
            if let date = cal.date(from: dc) {
                return formatCalloutDate(date: date, period: period, formatter: formatter)
            }
        }
    }

    // Fallback
    return label
}

func formatCalloutDate(date: Date, period: AdminHomeView.Period, formatter: DateFormatter) -> String {
    switch period {
    case .month:
        formatter.dateFormat = "d MMM yyyy"
    case .year, .program:
        formatter.dateFormat = "MMM yyyy"
    case .week:
        formatter.dateFormat = "EEE, d MMM"
    }
    return formatter.string(from: date)
}

func rangeLabel(for period: AdminHomeView.Period) -> String {
    rangeLabel(for: period, startDate: Date(), endDate: Date())
}

func rangeLabel(for period: AdminHomeView.Period, startDate: Date, endDate: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    let today = Date()

    switch period {
    case .week:
        return "This Week"
    case .month:
        formatter.dateFormat = "MMM yyyy"
        return formatter.string(from: today)
    case .year:
        formatter.dateFormat = "yyyy"
        return formatter.string(from: today)
    case .program:
        formatter.dateFormat = "MMM yyyy"
        let startText = formatter.string(from: startDate)
        let endText = formatter.string(from: endDate)
        return "\(startText) – \(endText)"
    }
}
