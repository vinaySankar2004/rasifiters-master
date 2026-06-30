import SwiftUI

struct SegmentedMetricPicker: View {
    let metrics: [WorkoutPopularityMetric]
    @Binding var selection: WorkoutPopularityMetric

    var body: some View {
        Picker("Metric", selection: $selection) {
            ForEach(metrics) { metric in
                Text(metric.title).tag(metric)
            }
        }
        .pickerStyle(.segmented)
    }
}

struct RankedBarList: View {
    struct RowItem: Identifiable {
        let id: String
        let name: String
        let value: Double
        let displayValue: String
        let color: Color
    }

    let rows: [RowItem]
    let maxValue: Double

    @State private var selected: RowItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let selected {
                detailPanel(selected)
            }

            ForEach(rows) { row in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selected = selected?.id == row.id ? nil : row
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(row.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                                .lineLimit(1)
                            Spacer()
                            Text(row.displayValue)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }

                        GeometryReader { geo in
                            let ratio = maxValue > 0 ? row.value / maxValue : 0
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(Color(.systemGray5))
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(row.color)
                                    .frame(width: geo.size.width * CGFloat(min(max(ratio, 0), 1)))
                            }
                        }
                        .frame(height: 8)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func detailPanel(_ row: RowItem) -> some View {
        HStack {
            Circle()
                .fill(row.color)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text(row.displayValue)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
        }
        .padding(10)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}
