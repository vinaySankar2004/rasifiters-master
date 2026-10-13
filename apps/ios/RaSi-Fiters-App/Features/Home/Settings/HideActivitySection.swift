import SwiftUI

/// My Profile → "Hide my activity" (D-P6 · D-P7; members `hide_activity`), directly above "Sign out everywhere". One
/// switch for every program: hides this member's workouts, streaks and kudos from plain co-members; program admins and
/// loggers still see them. GET /members/:id reads it (self only); PUT /members/:id { hide_activity } saves it and reverts
/// on failure (a 200 without the field is a failure — APIClient+People). Hidden when the server doesn't return the
/// field (no People slice yet) — never a switch that controls nothing. Reloads on reconnect after a failed load
/// (D-KIT-13).
struct HideActivitySection: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<Bool> = .idle
    @State private var isSupported = true
    @State private var isSaving = false
    @State private var saveError: String?

    var body: some View {
        if isSupported {
            VStack(alignment: .leading, spacing: 12) {
                Divider()
                if let hidden = state.value {
                    Toggle(isOn: Binding(get: { hidden }, set: { value in Task { await save(value) } })) { labels }
                        .adaptiveTint()
                        .disabled(isSaving)
                } else if case .failed = state {
                    labels
                    HStack {
                        Text(KitCopy.errorViewTitle)
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                        Spacer(minLength: 8)
                        Button(KitCopy.retry) { Task { await load() } }
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                            .frame(minHeight: 44)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline) {
                        labels
                        Spacer(minLength: 8)
                        ProgressView()
                    }
                }
                if let saveError {
                    Text(saveError)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appRed)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .task { await load() }
            .onChange(of: programContext.isOnline) { _, online in
                if online, state.error != nil { Task { await load() } }
            }
        }
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(PeopleCopy.hideActivity)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(PeopleCopy.hideActivityDetail)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func load() async {
        guard let memberId = programContext.loggedInUserId else { return }
        state = state.refreshing()
        do {
            guard let hidden = try await APIClient.shared.fetchHideActivity(memberId: memberId) else {
                isSupported = false
                return
            }
            state = .fresh(hidden)
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }

    private func save(_ hide: Bool) async {
        guard let memberId = programContext.loggedInUserId, let previous = state.value else { return }
        state = .fresh(hide)
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            state = .fresh(try await APIClient.shared.updateHideActivity(memberId: memberId, hide: hide))
        } catch {
            state = .fresh(previous)
            saveError = "\(PeopleCopy.saveFailed) \(SessionCopy.kitMessage(for: error))"
        }
    }
}
