import SwiftUI

// MARK: - Member list cards (the inline NavigationLink cards rendered by the Members tabs)
// Ported faithfully from legacy Features/Home/Detail/MemberCards.swift.

private func formatDuration(_ totalMinutes: Int) -> String {
    let h = totalMinutes / 60
    let m = totalMinutes % 60
    if h == 0 { return "\(m)m" }
    if m == 0 { return "\(h)h" }
    return "\(h)h \(m)m"
}

struct MemberHistoryCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?

    private var memberId: String? {
        selectedMember?.id ?? programContext.selectedMemberOverview?.member_id
    }

    private var memberPoints: [APIClient.ActivityTimelinePoint] {
        memberTimelinePoints(from: programContext.memberHistory)
    }

    var body: some View {
        let capturedMemberId = memberId  // Capture value directly
        return NavigationLink {
            ActivityTimelineDetailView(
                initialPeriod: .week,
                memberId: capturedMemberId,
                showActiveSeries: false
            )
            .navigationTitle("Workout History")
            .navigationBarTitleDisplayMode(.inline)
        } label: {
            ActivityTimelineCardSummary(points: memberPoints, showActive: false)
        }
    }
}

struct MemberStreakCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?

    private var streaks: APIClient.MemberStreaksResponse? { programContext.memberStreaks }

    var body: some View {
        NavigationLink {
            MemberStreakDetail()
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Streak Stats")
                            .font(.headline.weight(.semibold))
                        Text("Current and longest")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                HStack(spacing: 12) {
                    streakTile(title: "Current", value: streaks?.currentStreakDays ?? 0, icon: "flame.fill", color: .appOrange)
                    streakTile(title: "Longest", value: streaks?.longestStreakDays ?? 0, icon: "trophy.fill", color: .appYellow)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }

    private func streakTile(title: String, value: Int, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .font(.subheadline.weight(.bold))
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Text("\(value) days")
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct MemberRecentCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    var body: some View {
        NavigationLink {
            MemberRecentDetail(memberId: memberId, memberName: selectedMember?.member_name ?? programContext.loggedInUserName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Workouts")
                            .font(.headline.weight(.semibold))
                        Text("All workouts")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                if programContext.memberRecent.isEmpty {
                    Text("No workouts logged yet.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 8) {
                        ForEach(programContext.memberRecent.prefix(3)) { item in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(Color.appOrangeLight)
                                    .frame(width: 10, height: 10)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.workoutType)
                                        .font(.subheadline.weight(.semibold))
                                    Text(item.workoutDate)
                                        .font(.caption)
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                Spacer()
                                Text(formatDuration(item.durationMinutes))
                                    .font(.subheadline.weight(.semibold))
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }
}

struct MemberHealthCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?

    @State private var previewLogs: [APIClient.DailyHealthLogItem] = []

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    private var memberName: String? {
        selectedMember?.member_name ?? programContext.loggedInUserName
    }

    var body: some View {
        NavigationLink {
            MemberHealthDetail(memberId: memberId, memberName: memberName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Health")
                            .font(.headline.weight(.semibold))
                        Text("Daily health logs")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                if previewLogs.isEmpty {
                    Text("No daily health logs yet.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 8) {
                        ForEach(previewLogs.prefix(3)) { item in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(Color.appBlueLight)
                                    .frame(width: 10, height: 10)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.logDate)
                                        .font(.subheadline.weight(.semibold))
                                    Text("Sleep \(sleepLabel(item.sleepHours)) · Diet \(foodLabel(item.foodQuality)) · Steps \(stepsLabel(item.steps))")
                                        .font(.caption)
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                Spacer()
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .task(id: memberId) {
            previewLogs = []   // blank instantly on member switch — prevents showing the previous member's rows
            guard let memberId else { return }   // identity unresolved → preview stays on its existing empty state
            previewLogs = await programContext.loadMemberHealthLogs(memberId: memberId, limit: 10)
        }
    }

    private func sleepLabel(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f hrs", value)
    }

    private func foodLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value)/5"
    }

    private func stepsLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
