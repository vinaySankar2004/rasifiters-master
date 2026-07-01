import SwiftUI

/// Apple Health settings: connect toggle, per-program sync selection, sync status, disconnect.
/// Sync itself runs from `ProgramContext+HealthKit` (background delivery + app-lifecycle triggers);
/// this screen configures it. See specs/pages/ios/apple-health.
struct AppleHealthSettingsView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isSyncing = false

    private var isAvailable: Bool { HealthKitService.shared.isAvailable }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                if !isAvailable {
                    unavailableRow
                } else {
                    VStack(spacing: 12) {
                        if programContext.isHealthKitEnabled {
                            connectedRow
                        } else {
                            connectButton
                        }
                    }

                    if programContext.isHealthKitEnabled {
                        programSelectionSection
                        syncStatusSection
                        disconnectSection
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard let token = programContext.authToken, !token.isEmpty else { return }
            if let programs = try? await APIClient.shared.fetchPrograms(token: token) {
                programContext.programs = programs
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Apple Health")
                .font(.title2.weight(.bold))
                .foregroundColor(Color(.label))
            Text("Automatically sync workouts from Apple Health")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
        .padding(.top, 8)
    }

    // MARK: - Unavailable

    private var unavailableRow: some View {
        Text("Apple Health isn't available on this device.")
            .font(.caption)
            .foregroundColor(Color(.secondaryLabel))
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
            )
    }

    // MARK: - Connect button

    private var connectButton: some View {
        Button {
            programContext.startHealthKitSync()
        } label: {
            HStack(spacing: 14) {
                iconCircle(systemName: "heart.fill", tint: .appRed)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Connect to Apple Health")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("Grant access to read your workouts")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(.appRed)
            }
            .padding(14)
            .background(cardBackground)
            .overlay(cardBorder(.appRed.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Connected row

    private var connectedRow: some View {
        HStack(spacing: 14) {
            iconCircle(systemName: "heart.fill", tint: .appGreen)
            VStack(alignment: .leading, spacing: 4) {
                Text("Connected")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text("Apple Health workouts will sync automatically")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
        }
        .padding(14)
        .background(cardBackground)
        .overlay(cardBorder(.appGreen.opacity(0.3)))
    }

    // MARK: - Program selection

    private var programSelectionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sync to Programs")
                .font(.footnote.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))

            if programContext.programs.isEmpty {
                Text("No programs available. Join or create a program first.")
                    .font(.caption)
                    .foregroundColor(Color(.tertiaryLabel))
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(cardBackground)
                    .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))
            } else {
                VStack(spacing: 0) {
                    ForEach(programContext.programs, id: \.id) { program in
                        let isSelected = programContext.healthKitSyncProgramIds.contains(program.id)
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                if isSelected {
                                    programContext.healthKitSyncProgramIds.remove(program.id)
                                } else {
                                    programContext.healthKitSyncProgramIds.insert(program.id)
                                }
                                programContext.persistHealthKitSettings()
                            }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 22))
                                    .foregroundColor(isSelected ? .appOrange : Color(.tertiaryLabel))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(program.name)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(Color(.label))
                                    Text(program.status ?? "Active")
                                        .font(.caption)
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)

                        if program.id != programContext.programs.last?.id {
                            Divider().padding(.leading, 50)
                        }
                    }
                }
                .background(cardBackground)
                .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))
            }
        }
    }

    // MARK: - Sync status

    private var syncStatusSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sync Status")
                .font(.footnote.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))

            VStack(spacing: 0) {
                statusRow(title: "Last Synced", value: lastSyncLabel)
                Divider().padding(.leading, 14)
                statusRow(title: "Workouts Synced", value: "\(programContext.lastHealthKitSyncCount)")
                Divider().padding(.leading, 14)

                Button {
                    isSyncing = true
                    Task {
                        await programContext.performHealthKitSync()
                        isSyncing = false
                    }
                } label: {
                    HStack {
                        Text("Sync Now")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.appOrange)
                        Spacer()
                        if isSyncing {
                            ProgressView().scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.appOrange)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
                .buttonStyle(.plain)
                .disabled(isSyncing)
            }
            .background(cardBackground)
            .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))
        }
    }

    private func statusRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(.subheadline)
                .foregroundColor(Color(.label))
            Spacer()
            Text(value)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: - Disconnect

    private var disconnectSection: some View {
        Button {
            programContext.clearHealthKitSettings()
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.appRedLight)
                        .frame(width: 42, height: 42)
                    Image(systemName: "heart.slash.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.appRed)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Disconnect Apple Health")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.appRed)
                    Text("Stop syncing and clear settings")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
            }
            .padding(14)
            .background(cardBackground)
            .overlay(cardBorder(.appRed.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Shared styling

    private func iconCircle(systemName: String, tint: Color) -> some View {
        ZStack {
            Circle()
                .fill(tint.opacity(0.14))
                .frame(width: 42, height: 42)
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(tint)
        }
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Color(.systemBackground))
    }

    private func cardBorder(_ color: Color) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(color, lineWidth: 1)
    }

    private var lastSyncLabel: String {
        guard let date = programContext.lastHealthKitSyncDate else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
