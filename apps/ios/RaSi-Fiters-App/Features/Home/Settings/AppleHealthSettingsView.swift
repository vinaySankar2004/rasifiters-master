import SwiftUI

/// Apple Health settings: connect toggle, per-program sync selection, sync status, disconnect.
/// Sync itself runs from `ProgramContext+HealthKit` (background delivery + app-lifecycle triggers);
/// this screen configures it. See specs/pages/ios/apple-health.
struct AppleHealthSettingsView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isSyncing = false
    @State private var isSleepSyncingNow = false

    private var isAvailable: Bool { HealthKitService.shared.isAvailable }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                if !isAvailable {
                    unavailableRow
                } else {
                    // ── Workouts ──
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

                    Divider().padding(.vertical, 4)

                    // ── Sleep (independent toggle, same screen) ──
                    sleepHeader

                    VStack(spacing: 12) {
                        if programContext.isSleepSyncEnabled {
                            sleepConnectedRow
                        } else {
                            sleepConnectButton
                        }
                    }

                    if programContext.isSleepSyncEnabled {
                        sleepProgramSelectionSection
                        sleepSyncStatusSection
                        sleepDisconnectSection
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
            Text("Automatically sync workouts and sleep from Apple Health")
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
                        programRow(program, isSelected: programContext.healthKitSyncProgramIds.contains(program.id)) {
                            if programContext.healthKitSyncProgramIds.contains(program.id) {
                                programContext.healthKitSyncProgramIds.remove(program.id)
                            } else {
                                programContext.healthKitSyncProgramIds.insert(program.id)
                            }
                            programContext.persistHealthKitSettings()
                        }

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

    /// One selectable program row shared by the workout + sleep selectors. An admin-locked program
    /// (per `isDataEntryLocked`) renders with a lock icon + caption, dimmed and non-selectable — it
    /// can't receive synced data, so mirror the widget forms' lock affordance.
    @ViewBuilder
    private func programRow(_ program: APIClient.ProgramDTO, isSelected: Bool,
                            onToggle: @escaping () -> Void) -> some View {
        let locked = programContext.isDataEntryLocked(programId: program.id)
        Button {
            guard !locked else { return }
            withAnimation(.easeInOut(duration: 0.15)) { onToggle() }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: locked ? "lock.fill" : (isSelected ? "checkmark.circle.fill" : "circle"))
                    .font(.system(size: 22))
                    .foregroundColor(locked ? Color(.tertiaryLabel) : (isSelected ? .appOrange : Color(.tertiaryLabel)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text(locked ? "Admin-only — can't sync" : (program.status ?? "Active"))
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .opacity(locked ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(locked)
    }

    /// Count of currently-selected programs that are admin-locked for this viewer (won't sync).
    private func lockedSelectedCount(_ ids: Set<String>) -> Int {
        ids.filter { programContext.isDataEntryLocked(programId: $0) }.count
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

            let lockedCount = lockedSelectedCount(programContext.healthKitSyncProgramIds)
            if lockedCount > 0 {
                Text("\(lockedCount) program\(lockedCount == 1 ? "" : "s") are admin-locked and won't sync")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
                    .padding(.horizontal, 4)
            }
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

    // MARK: - Sleep header

    private var sleepHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Sleep")
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
            Text("Automatically log your nightly time asleep")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
    }

    // MARK: - Sleep connect button

    private var sleepConnectButton: some View {
        Button {
            programContext.startSleepSync()
        } label: {
            HStack(spacing: 14) {
                iconCircle(systemName: "moon.fill", tint: .appBlue)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Connect Sleep")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text("Grant access to read your sleep")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(.appBlue)
            }
            .padding(14)
            .background(cardBackground)
            .overlay(cardBorder(.appBlue.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sleep connected row

    private var sleepConnectedRow: some View {
        HStack(spacing: 14) {
            iconCircle(systemName: "moon.fill", tint: .appGreen)
            VStack(alignment: .leading, spacing: 4) {
                Text("Connected")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text("Apple Health sleep will sync automatically")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
        }
        .padding(14)
        .background(cardBackground)
        .overlay(cardBorder(.appGreen.opacity(0.3)))
    }

    // MARK: - Sleep program selection

    private var sleepProgramSelectionSection: some View {
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
                        programRow(program, isSelected: programContext.sleepSyncProgramIds.contains(program.id)) {
                            if programContext.sleepSyncProgramIds.contains(program.id) {
                                programContext.sleepSyncProgramIds.remove(program.id)
                            } else {
                                programContext.sleepSyncProgramIds.insert(program.id)
                            }
                            programContext.persistSleepSyncSettings()
                        }

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

    // MARK: - Sleep sync status

    private var sleepSyncStatusSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sync Status")
                .font(.footnote.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))

            VStack(spacing: 0) {
                statusRow(title: "Last Synced", value: lastSleepSyncLabel)
                Divider().padding(.leading, 14)
                statusRow(title: "Nights Synced", value: "\(programContext.lastSleepSyncCount)")
                Divider().padding(.leading, 14)

                Button {
                    isSleepSyncingNow = true
                    Task {
                        await programContext.performSleepSync()
                        isSleepSyncingNow = false
                    }
                } label: {
                    HStack {
                        Text("Sync Now")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.appOrange)
                        Spacer()
                        if isSleepSyncingNow {
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
                .disabled(isSleepSyncingNow)
            }
            .background(cardBackground)
            .overlay(cardBorder(Color(.systemGray4).opacity(0.6)))

            let lockedCount = lockedSelectedCount(programContext.sleepSyncProgramIds)
            if lockedCount > 0 {
                Text("\(lockedCount) program\(lockedCount == 1 ? "" : "s") are admin-locked and won't sync")
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
                    .padding(.horizontal, 4)
            }
        }
    }

    // MARK: - Sleep disconnect

    private var sleepDisconnectSection: some View {
        Button {
            programContext.clearSleepSyncSettings()
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.appRedLight)
                        .frame(width: 42, height: 42)
                    Image(systemName: "moon.zzz.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.appRed)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Disconnect Sleep")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.appRed)
                    Text("Stop syncing sleep and clear settings")
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

    private var lastSleepSyncLabel: String {
        guard let date = programContext.lastSleepSyncDate else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
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
