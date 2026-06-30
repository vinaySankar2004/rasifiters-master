import SwiftUI

// MARK: - Standard Program Tab (for non-admin users)
// Faithful 1:1 port of ios-mobile Features/Home/Tabs/StandardProgramTab.swift.
// Cleanups: D-C1 leave logic via shared .leaveProgramConfirmation; D-C2 dropped dead PlaceholderTab;
// D-C3 tokenized the info-card header .blue → .appBlue.

struct StandardProgramTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showSelectProgram = false
    @State private var showLeaveProgramConfirm = false
    @State private var isLeavingProgram = false

    private var loggedInUserInitials: String {
        guard let name = programContext.loggedInUserName else { return "??" }
        return name
            .split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color.appBackground
                    .ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        // Header
                        HStack(alignment: .center) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Program")
                                    .font(.largeTitle.weight(.bold))
                                    .foregroundColor(Color(.label))
                                Text(programContext.name)
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
                                Text(loggedInUserInitials)
                                    .font(.headline.weight(.bold))
                                    .foregroundColor(.black)
                            }
                        }
                        .padding(.top, 24)

                        // Program Info Card (read-only)
                        programInfoCard

                        // Switch Program Button
                        switchProgramButton

                        // Leave Program Button
                        leaveProgramButton

                        // My Account Section
                        ProgramMyAccountSection()
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
            }
            .navigationBarBackButtonHidden(true)
            .navigationDestination(isPresented: $showSelectProgram) {
                ProgramPickerView()
                    .navigationBarBackButtonHidden(true)
            }
            .leaveProgramConfirmation(
                isPresented: $showLeaveProgramConfirm,
                isLeaving: $isLeavingProgram
            ) {
                showSelectProgram = true
            }
        }
    }

    private var programInfoCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Section Header
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.appBlue)
                Text("Program Info")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(Color(.label))
            }

            VStack(alignment: .leading, spacing: 12) {
                // Program Name
                HStack {
                    Text("Name")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer()
                    Text(programContext.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                }

                Divider()

                // Status
                HStack {
                    Text("Status")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer()
                    Text(programContext.status.capitalized)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(statusColor(programContext.status))
                        )
                }

                Divider()

                // Date Range
                HStack {
                    Text("Duration")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer()
                    Text(programContext.dateRangeLabel)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(Color(.label))
                }

                Divider()

                // Progress
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Progress")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                        Spacer()
                        Text("\(programContext.completionPercent)%")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                    }

                    ProgressView(value: Double(programContext.completionPercent) / 100.0)
                        .accentColor(statusColor(programContext.status))
                        .scaleEffect(x: 1, y: 1.5, anchor: .center)

                    HStack {
                        Text("\(programContext.elapsedDays) days elapsed")
                            .font(.caption)
                            .foregroundColor(Color(.tertiaryLabel))
                        Spacer()
                        Text("\(programContext.remainingDays) days remaining")
                            .font(.caption)
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }

                Divider()

                // Active Members
                HStack {
                    Text("Active Members")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer()
                    Text("\(programContext.activeMembers)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
            )
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
    }

    private var switchProgramButton: some View {
        Button {
            showSelectProgram = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.appOrangeVeryLight)
                        .frame(width: 42, height: 42)
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.appOrange)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Switch Program")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("View a different program")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding(14)
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

    private var leaveProgramButton: some View {
        Button {
            showLeaveProgramConfirm = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color(.systemGray5))
                        .frame(width: 42, height: 42)
                    Image(systemName: "arrow.left.circle")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(.secondaryLabel))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Leave Program")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("Your data will be preserved")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                if isLeavingProgram {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
            .padding(14)
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
        .disabled(isLeavingProgram)
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "completed": return .appGreen
        case "planned": return .appBlue
        case "active": return .appOrange
        default: return .appOrange
        }
    }
}
