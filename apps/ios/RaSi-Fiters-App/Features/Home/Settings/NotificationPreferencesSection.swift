import SwiftUI

/// The per-member notification switches + the daily-reminder time (D-N1 · D-N2 · D-N7 · D-N10; notifications contract
/// C2 / C4). Server-side, so they follow the member to every device and to web. Each change is a partial
/// PUT /notifications/preferences that reverts on failure; Reminders + Weekly digest are opt-in (App Store 4.5.4).
/// Kit: loading / error view / inline "Couldn't refresh · Retry" over kept settings / reload on reconnect.
struct NotificationPreferencesSection: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<APIClient.NotificationPreferencesDTO> = .idle
    @State private var reminderDate = NotificationPreferencesSection.date(from: "19:00")
    @State private var reminderSave: Task<Void, Never>?
    @State private var saveError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(NotificationPrefsCopy.sectionTitle)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            switch state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await load() } })
            case .loaded(let preferences, _, _), .stale(let preferences, _, _):
                switches(preferences)
            }
            // Kept settings whose refresh failed (kit §6) — inline: a floating banner would cover the permission card.
            if case .stale = state, programContext.isOnline {
                HStack(spacing: 8) {
                    Text(KitCopy.bannerStale)
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer(minLength: 8)
                    Button(KitCopy.retry) { Task { await load() } }
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appOrange)
                        .frame(minHeight: 44)
                }
            }
            if let saveError {
                Text(saveError)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(NotificationPrefsCopy.footnote)
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await load() }
        .onChange(of: reminderDate) { _, date in scheduleReminderSave(date) }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }          // D-KIT-13: refetch on reconnect
        }
    }

    private func switches(_ preferences: APIClient.NotificationPreferencesDTO) -> some View {
        VStack(spacing: 0) {
            ForEach(NotificationPrefsCopy.categories, id: \.key) { category in
                Toggle(isOn: binding(for: category.key)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                        Text(category.detail)
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .adaptiveTint()
                .padding(14)
                if category.key == "reminders", preferences.categories["reminders"] == true {
                    reminderTimeRow
                }
                if category.key != NotificationPrefsCopy.categories.last?.key {
                    Divider().padding(.leading, 14)
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))
    }

    private var reminderTimeRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(NotificationPrefsCopy.reminderTime)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text(NotificationPrefsCopy.reminderTimeDetail)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            DatePicker(NotificationPrefsCopy.reminderTime, selection: $reminderDate, displayedComponents: .hourAndMinute)
                .labelsHidden()
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private func binding(for key: String) -> Binding<Bool> {
        Binding(
            get: { state.value?.categories[key] ?? ProgramContext.defaultNotificationCategories[key] ?? false },
            set: { value in Task { await save(categories: [key: value]) } }
        )
    }

    private func load() async {
        if state.value == nil, let cached = programContext.notificationPreferences {
            state = .loaded(cached, fetchedAt: Date(), refreshing: true)      // instant from the session cache
            reminderDate = Self.date(from: cached.reminderTime)
        }
        state = state.refreshing()
        do {
            let preferences = try await programContext.loadNotificationPreferences()
            state = .fresh(preferences)
            reminderDate = Self.date(from: preferences.reminderTime)
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }

    /// Optimistic partial PUT; a failure restores the previous values + says why.
    private func save(categories: [String: Bool]? = nil, reminderTime: String? = nil) async {
        guard let previous = state.value else { return }
        var next = previous
        categories?.forEach { next.categories[$0.key] = $0.value }
        if let reminderTime { next.reminderTime = reminderTime }
        state = .fresh(next)
        saveError = nil
        do {
            let saved = try await APIClient.shared.updateNotificationPreferences(categories: categories, reminderTime: reminderTime)
            state = .fresh(saved)
            programContext.notificationPreferences = saved
        } catch {
            state = .fresh(previous)
            reminderDate = Self.date(from: previous.reminderTime)
            saveError = "\(NotificationPrefsCopy.saveFailed) \(SessionCopy.kitMessage(for: error))"
        }
    }

    /// The time wheel moves continuously — save once it rests (0.6 s).
    private func scheduleReminderSave(_ date: Date) {
        let time = Self.timeFormatter.string(from: date)
        guard let current = state.value, time != current.reminderTime else { return }
        reminderSave?.cancel()
        reminderSave = Task {
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            await save(reminderTime: time)
        }
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    private static func date(from time: String) -> Date {
        timeFormatter.date(from: time) ?? timeFormatter.date(from: "19:00") ?? Date()
    }
}

/// Notification-preferences copy — the shared notification copy table (identical on web / iOS / Android). Labels =
/// notifications contract C2.
enum NotificationPrefsCopy {
    struct Category {
        let key: String
        let title: String
        let detail: String
    }

    static let categories: [Category] = [
        Category(key: "program", title: "Program & invites", detail: "Invites, role changes and updates to your programs."),
        Category(key: "activity", title: "Activity", detail: "Kudos from people in your programs."),
        Category(key: "reminders", title: "Reminders", detail: "One reminder a day around your chosen time, only if you haven't logged a workout that day."),
        Category(key: "digest", title: "Weekly digest", detail: "A recap of your past week, every Monday morning."),
        Category(key: "announcements", title: "Announcements", detail: "News and messages from the RaSi Fiters team.")
    ]
    static let screenSubtitle = "Choose what RaSi Fiters notifies you about."
    static let sectionTitle = "Notify me about"
    static let reminderTime = "Reminder time"
    static let reminderTimeDetail = "Uses your phone's time zone."
    static let footnote = "Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox."
    static let saveFailed = "Couldn't save."
}
