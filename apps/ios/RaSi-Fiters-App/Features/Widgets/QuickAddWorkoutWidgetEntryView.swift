//
//  QuickAddWorkoutWidgetEntryView.swift
//  RaSi-Fiters-App
//
//  The widget deep-link target for "Add workouts" — the SAME multi-row batch form as the in-app
//  AddWorkoutsDetailView (Features/Home/Detail), reached when `AppRootView` presents
//  `WidgetRoute.quickAddWorkout`. Two deltas from the in-app form:
//    1. NO auto-selected program — the user picks any active/loggable program(s) (`currentProgramId`
//       is "" so nothing is force-checked, and there is no `.task` seeding).
//    2. The custom back button exits to My Programs (`exitToMyPrograms`, today's widget behavior)
//       instead of a plain dismiss, and the form stays non-interactively-dismissible.
//
//  Because there is no single active program here, member/workout options are the INTERSECTION across
//  the selected programs (per-program lookups cached in `programMembers`/`programWorkouts`), and the
//  batch save passes the first selected program as `program_id` + the full set as `program_ids`.
//  Follows the widget pattern (WidgetQuickAddComponents.swift): own @State + save logic, shared chrome.
//

import SwiftUI

struct QuickAddWorkoutWidgetEntryView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    private static let maxRows = 200

    struct BulkRow: Identifiable {
        let id: Int
        var memberId: String = ""
        var memberName: String = ""
        var workoutName: String = ""
        var date: Date = Date()
        var hoursText: String = ""
        var minutesText: String = ""
        /// Server-reported error for this row — drives the red highlight.
        var backendError: String? = nil
    }

    @State private var rows: [BulkRow] = []
    @State private var nextUid = 0
    @State private var submittedOrder: [Int] = []
    @State private var isSaving = false
    @State private var topErrorMessage: String?
    @State private var selectedProgramIds: Set<String> = []
    @State private var showSuccessToast = false

    @State private var memberPickerRowId: Int?
    @State private var workoutPickerRowId: Int?

    // Per-program lookups (there is no single active program), intersected across the selection.
    @State private var programMembers: [String: [APIClient.MembershipDetailDTO]] = [:]
    @State private var programWorkouts: [String: [APIClient.ProgramWorkoutDTO]] = [:]

    // MARK: - Program derived

    /// Programs where the viewer is an active member — the component further drops completed/locked.
    private var activePrograms: [APIClient.ProgramDTO] {
        programContext.programs.filter { ($0.my_status ?? "").lowercased() == "active" }
    }

    private var selectedPrograms: [APIClient.ProgramDTO] {
        programContext.programs.filter { selectedProgramIds.contains($0.id) }
    }

    // MARK: - Member privilege (DC-3, sourced from the selected ProgramDTOs — no active program)

    private func privileged(_ program: APIClient.ProgramDTO) -> Bool {
        programContext.isGlobalAdmin
            || program.my_role?.lowercased() == "admin"
            || program.my_role?.lowercased() == "logger"
    }

    /// Coarse capability — is the viewer an admin/logger anywhere (drives the member-lock hint).
    private var canSelectAnyMember: Bool {
        programContext.isGlobalAdmin || programContext.programs.contains { privileged($0) }
    }

    /// Locks to self when ANY selected program is one the viewer is not privileged in.
    private var memberLocked: Bool {
        guard !selectedProgramIds.isEmpty else { return false }
        return selectedPrograms.contains { !privileged($0) }
    }

    private var effectiveCanSelectAnyMember: Bool {
        !selectedProgramIds.isEmpty && canSelectAnyMember && !memberLocked
    }

    /// True when the member column is hidden (plain member, locked, or nothing selected yet).
    private var ignoreMember: Bool { !effectiveCanSelectAnyMember }

    private var memberLockHint: String? {
        (canSelectAnyMember && memberLocked)
            ? "You're not an admin or logger in every selected program — logging for yourself only."
            : nil
    }

    // MARK: - Member / workout intersection across the selected programs

    private var availableMembers: [WidgetMemberOption] {
        guard !selectedProgramIds.isEmpty else { return [] }
        let lists = selectedProgramIds.compactMap { programMembers[$0] }
        guard lists.count == selectedProgramIds.count, let first = lists.first else { return [] }
        var intersection = Set(first.map { $0.member_id })
        for list in lists.dropFirst() {
            intersection.formIntersection(list.map { $0.member_id })
        }
        return first
            .filter { intersection.contains($0.member_id) }
            .map { WidgetMemberOption(id: $0.member_id, name: $0.member_name) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var availableWorkouts: [String] {
        guard !selectedProgramIds.isEmpty else { return [] }
        let lists = selectedProgramIds.compactMap { programWorkouts[$0] }
        guard lists.count == selectedProgramIds.count, let first = lists.first else { return [] }
        var intersection = Set(first.map { $0.workout_name })
        for list in lists.dropFirst() {
            intersection.formIntersection(list.map { $0.workout_name })
        }
        return first
            .map { $0.workout_name }
            .filter { intersection.contains($0) }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    // MARK: - Row derived (mirrors AddWorkoutsDetailView)

    private var nonEmptyRows: [BulkRow] { rows.filter { !isEmptyRow($0) } }
    private var validRows: [BulkRow] { nonEmptyRows.filter { isValidRow($0) } }
    private var invalidCount: Int { nonEmptyRows.count - validRows.count }
    private var canSubmit: Bool {
        !selectedProgramIds.isEmpty && !validRows.isEmpty && invalidCount == 0 && !isSaving
    }
    private var atMax: Bool { rows.count >= Self.maxRows }

    private var distinctMembers: Int { Set(validRows.map { $0.memberId }).count }
    private var totalMinutes: Int { validRows.reduce(0) { $0 + rowDuration($1) } }

    private var summaryLine: String {
        let rowsPart = "\(validRows.count) \(validRows.count == 1 ? "row" : "rows")"
        let minutesPart = "\(totalMinutes) min total"
        if effectiveCanSelectAnyMember {
            let membersPart = "\(distinctMembers) \(distinctMembers == 1 ? "member" : "members")"
            return "\(rowsPart) • \(membersPart) • \(minutesPart)"
        }
        return "\(rowsPart) • \(minutesPart)"
    }

    // MARK: - Body

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpacing.lg) {
                    WidgetQuickAddHeader(
                        title: "Add workouts",
                        subtitle: effectiveCanSelectAnyMember
                            ? "Add a row per session — member, workout, date, and duration — then save them all at once."
                            : "Add a row per session — workout, date, and duration — then save them all at once.",
                        onBack: { exitToMyPrograms() }
                    )

                    ProgramMultiSelectSection(
                        programs: activePrograms,
                        currentProgramId: "",
                        selectedIds: $selectedProgramIds,
                        isLocked: { programContext.isDataEntryLocked(programId: $0) },
                        memberLockHint: memberLockHint,
                        alwaysShow: true
                    )

                    if rows.isEmpty {
                        emptyState
                    } else {
                        ForEach(rows) { row in
                            rowCard(row)
                        }
                    }

                    addRowControls

                    if invalidCount > 0 {
                        Text("\(invalidCount) \(invalidCount == 1 ? "row needs" : "rows need") attention before saving.")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appRed)
                    }
                    if let topErrorMessage {
                        Text(topErrorMessage)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appRed)
                    }

                    Text(summaryLine)
                        .font(.footnote)
                        .foregroundColor(.secondary)

                    AppPrimaryButton(title: isSaving ? "Saving…" : "Save all", isLoading: isSaving) {
                        Task { await save() }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(!canSubmit)
                    .opacity(canSubmit ? 1 : 0.5)
                    .padding(.top, AppSpacing.sm)
                }
                .padding(20)
            }

            if showSuccessToast {
                WidgetSuccessToast(text: "Workout logged")
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
            }
        }
        .adaptiveBackground(topLeading: true)
        .navigationBarBackButtonHidden(true)
        .interactiveDismissDisabled(true)
        .task { await loadInitialData() }
        .onChange(of: selectedProgramIds) { _, _ in
            Task { await loadSelectedProgramData() }
        }
        .onChange(of: ignoreMember) { _, nowIgnore in
            // The member column just appeared/disappeared. When it disappears (plain member or a
            // member-locked selection), force every row to self so a hidden foreign member can't be
            // submitted (in-app twin's onChange(memberLocked) parity). When it appears (the viewer
            // gained member selection), clear the auto-seeded self so the field reads "Select member".
            let selfId = programContext.loggedInUserId ?? ""
            let selfName = programContext.loggedInUserName ?? ""
            for i in rows.indices {
                if nowIgnore {
                    rows[i].memberId = selfId
                    rows[i].memberName = selfName
                } else if rows[i].memberId == selfId {
                    rows[i].memberId = ""
                    rows[i].memberName = ""
                }
            }
        }
        .sheet(item: memberPickerBinding) { target in
            SearchablePickerSheet(
                title: "Select member",
                options: availableMembers.map { .init(id: $0.id, label: $0.name) },
                selectedId: rows.first { $0.id == target.id }?.memberId
            ) { option in
                updateRow(target.id) {
                    $0.memberId = option.id
                    $0.memberName = option.label
                }
            }
        }
        .sheet(item: workoutPickerBinding) { target in
            SearchablePickerSheet(
                title: "Select workout",
                options: availableWorkouts.map { .init(id: $0, label: $0) },
                selectedId: rows.first { $0.id == target.id }?.workoutName
            ) { option in
                updateRow(target.id) { $0.workoutName = option.id }
            }
        }
    }

    // MARK: - Row card

    @ViewBuilder
    private func rowCard(_ row: BulkRow) -> some View {
        let hasError = row.backendError != nil
        let clientError = clientRowError(row)

        VStack(alignment: .leading, spacing: AppSpacing.md) {
            HStack {
                Text("Entry \(rowNumber(row))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Button {
                    removeRow(row.id)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            // Members log only for themselves, so the member field is hidden for them entirely.
            if effectiveCanSelectAnyMember {
                LogFieldLabel("Member")
                Button { memberPickerRowId = row.id } label: {
                    LogFieldRow(text: row.memberName.isEmpty ? "Select member" : row.memberName,
                                isPlaceholder: row.memberName.isEmpty,
                                systemIcon: "chevron.up.chevron.down")
                }
            }

            LogFieldLabel("Workout")
            Button { workoutPickerRowId = row.id } label: {
                LogFieldRow(text: row.workoutName.isEmpty ? "Select workout" : row.workoutName,
                            isPlaceholder: row.workoutName.isEmpty,
                            systemIcon: "chevron.up.chevron.down")
            }

            LogFieldLabel("Date")
            DatePicker("", selection: bindingForDate(row.id), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)

            LogFieldLabel("Duration")
            HStack(spacing: AppSpacing.md) {
                AppInputField(title: "Hours", text: bindingForHours(row.id), keyboardType: .numberPad)
                AppInputField(title: "Minutes", text: bindingForMinutes(row.id), keyboardType: .numberPad)
            }

            if let message = row.backendError ?? clientError {
                Text(message)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
            }
        }
        .padding(AppSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .fill(hasError ? Color.appRed.opacity(0.06) : Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(hasError ? Color.appRed : Color(.systemGray4).opacity(0.6), lineWidth: hasError ? 1.5 : 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: AppSpacing.md) {
            Text("No rows yet.")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Button { addRows(1) } label: {
                Text("+ Add first row")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.appOrange)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppSpacing.xl)
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [5]))
                .foregroundColor(Color(.systemGray3))
        )
    }

    private var addRowControls: some View {
        HStack(spacing: AppSpacing.md) {
            Button { addRows(1) } label: {
                Text("+ Add row").font(.subheadline.weight(.semibold))
            }
            .disabled(atMax)
            Button { addRows(5) } label: {
                Text("+ Add 5 rows").font(.subheadline.weight(.semibold))
            }
            .disabled(atMax)
            if atMax {
                Text("Max \(Self.maxRows) rows")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .buttonStyle(.plain)
        .foregroundColor(.appOrange)
    }

    // MARK: - Row helpers

    private func rowHours(_ r: BulkRow) -> Int { Int(r.hoursText) ?? 0 }
    private func rowMinutes(_ r: BulkRow) -> Int { Int(r.minutesText) ?? 0 }
    private func rowDuration(_ r: BulkRow) -> Int { rowHours(r) * 60 + rowMinutes(r) }

    private func isEmptyRow(_ r: BulkRow) -> Bool {
        let memberEmpty = ignoreMember || r.memberId.isEmpty
        return memberEmpty && r.workoutName.isEmpty && r.hoursText.isEmpty && r.minutesText.isEmpty
    }

    private func isValidRow(_ r: BulkRow) -> Bool {
        (ignoreMember || !r.memberId.isEmpty) && !r.workoutName.isEmpty && rowMinutes(r) < 60 && rowDuration(r) > 0
    }

    /// Live client-side validation message for a non-empty row (nil when valid or empty).
    private func clientRowError(_ r: BulkRow) -> String? {
        if isEmptyRow(r) { return nil }
        if !ignoreMember && r.memberId.isEmpty { return "Select a member" }
        if r.workoutName.isEmpty { return "Select a workout" }
        if rowMinutes(r) >= 60 { return "Minutes must be 0–59" }
        if rowDuration(r) <= 0 { return "Add a duration" }
        return nil
    }

    private func rowNumber(_ r: BulkRow) -> Int {
        (rows.firstIndex { $0.id == r.id } ?? 0) + 1
    }

    // MARK: - Row mutation

    private func addRows(_ count: Int) {
        guard rows.count < Self.maxRows else { return }
        let baseDate = rows.last?.date ?? Date()
        let room = min(count, Self.maxRows - rows.count)
        var additions: [BulkRow] = []
        for _ in 0..<room {
            var row = BulkRow(id: nextUid, date: baseDate)
            // Plain members (or a locked selection) log only for themselves — seed self.
            if ignoreMember {
                row.memberId = programContext.loggedInUserId ?? ""
                row.memberName = programContext.loggedInUserName ?? ""
            }
            additions.append(row)
            nextUid += 1
        }
        rows.append(contentsOf: additions)
    }

    private func updateRow(_ id: Int, _ mutate: (inout BulkRow) -> Void) {
        guard let idx = rows.firstIndex(where: { $0.id == id }) else { return }
        mutate(&rows[idx])
        rows[idx].backendError = nil // editing clears any stale server error on this row
    }

    private func removeRow(_ id: Int) {
        rows.removeAll { $0.id == id }
    }

    private func bindingForDate(_ id: Int) -> Binding<Date> {
        Binding(
            get: { rows.first { $0.id == id }?.date ?? Date() },
            set: { newValue in updateRow(id) { $0.date = newValue } }
        )
    }
    private func bindingForHours(_ id: Int) -> Binding<String> {
        Binding(
            get: { rows.first { $0.id == id }?.hoursText ?? "" },
            set: { newValue in updateRow(id) { $0.hoursText = newValue } }
        )
    }
    private func bindingForMinutes(_ id: Int) -> Binding<String> {
        Binding(
            get: { rows.first { $0.id == id }?.minutesText ?? "" },
            set: { newValue in updateRow(id) { $0.minutesText = newValue } }
        )
    }

    private struct RowTarget: Identifiable { let id: Int }
    private var memberPickerBinding: Binding<RowTarget?> {
        Binding(
            get: { memberPickerRowId.map(RowTarget.init) },
            set: { memberPickerRowId = $0?.id }
        )
    }
    private var workoutPickerBinding: Binding<RowTarget?> {
        Binding(
            get: { workoutPickerRowId.map(RowTarget.init) },
            set: { workoutPickerRowId = $0?.id }
        )
    }

    // MARK: - Data loading

    @MainActor
    private func loadInitialData() async {
        if programContext.programs.isEmpty {
            await programContext.loadLookupData()
        }
        // The multi-select needs the full program list (with per-program roles).
        if programContext.programs.isEmpty,
           let token = programContext.authToken, !token.isEmpty,
           let fetched = try? await APIClient.shared.fetchPrograms(token: token) {
            programContext.programs = fetched
        }
        if rows.isEmpty { addRows(1) }
    }

    @MainActor
    private func loadSelectedProgramData() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        guard !selectedProgramIds.isEmpty else {
            syncRowsAfterSelectionChange()
            return
        }

        for programId in Array(selectedProgramIds) {
            if programMembers[programId] == nil,
               let data = try? await APIClient.shared.fetchMembershipDetails(token: token, programId: programId) {
                programMembers[programId] = data.filter { $0.is_active }
            }
            if programWorkouts[programId] == nil,
               let data = try? await APIClient.shared.fetchProgramWorkouts(token: token, programId: programId) {
                programWorkouts[programId] = data.filter { !$0.is_hidden }
            }
        }
        syncRowsAfterSelectionChange()
    }

    /// After the selection's data loads, drop any per-row member/workout no longer shared across the
    /// selection. Skipped while any selected program's lookup is still missing — a transient fetch
    /// failure must NOT wipe entered rows. Self-seeding for the member-locked case is handled by
    /// `addRows` + the `ignoreMember` onChange, not here.
    @MainActor
    private func syncRowsAfterSelectionChange() {
        guard !selectedProgramIds.isEmpty,
              selectedProgramIds.allSatisfy({ programMembers[$0] != nil && programWorkouts[$0] != nil })
        else { return }
        let memberIds = Set(availableMembers.map { $0.id })
        let workouts = Set(availableWorkouts)
        for i in rows.indices {
            if !ignoreMember, !rows[i].memberId.isEmpty, !memberIds.contains(rows[i].memberId) {
                rows[i].memberId = ""
                rows[i].memberName = ""
            }
            if !rows[i].workoutName.isEmpty, !workouts.contains(rows[i].workoutName) {
                rows[i].workoutName = ""
            }
        }
    }

    // MARK: - Save

    @MainActor
    private func save() async {
        guard let token = programContext.authToken, !token.isEmpty else { return }
        let ids = selectedProgramIds.sorted()
        guard let primary = ids.first else { return }
        let included = rows.filter { !isEmptyRow($0) && isValidRow($0) }
        guard !included.isEmpty else { return }

        isSaving = true
        topErrorMessage = nil
        showSuccessToast = false
        submittedOrder = included.map { $0.id }

        let entries = included.map {
            APIClient.BulkWorkoutEntry(
                member_id: $0.memberId,
                workout_name: $0.workoutName,
                date: LogDateFormatter.string(from: $0.date),
                duration: rowDuration($0)
            )
        }

        do {
            _ = try await APIClient.shared.addWorkoutLogsBatch(
                token: token,
                programId: primary,
                programIds: ids,
                entries: entries
            )
            programContext.summaryRefreshToken += 1 // web parity: ≈ invalidateQueries(["summary"])
            showSuccessToast = true
            scheduleSuccessDismiss()
        } catch let error as APIClient.BulkWorkoutError {
            applyRowErrors(error.rowErrors)
            topErrorMessage = error.message
            isSaving = false
        } catch {
            topErrorMessage = error.localizedDescription
            isSaving = false
        }
    }

    /// Map server per-row errors (indexed by submit order) back onto rows by uid → red highlight.
    private func applyRowErrors(_ errors: [APIClient.BulkRowError]) {
        for i in rows.indices { rows[i].backendError = nil }
        var byUid: [Int: String] = [:]
        for err in errors {
            guard err.index >= 0, err.index < submittedOrder.count else { continue }
            byUid[submittedOrder[err.index]] = err.message
        }
        for i in rows.indices {
            if let message = byUid[rows[i].id] { rows[i].backendError = message }
        }
    }

    @MainActor
    private func scheduleSuccessDismiss() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            exitToMyPrograms()
        }
    }

    @MainActor
    private func exitToMyPrograms() {
        programContext.returnToMyPrograms = true
        programContext.widgetRoute = nil
        dismiss()
    }
}

#Preview {
    QuickAddWorkoutWidgetEntryView()
}
