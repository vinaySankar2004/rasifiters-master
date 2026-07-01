//
//  BulkAddWorkoutDetailView.swift
//  RaSi-Fiters-App
//
//  Summary "Bulk add" card → the multi-row bulk-log form. The iOS analogue of the web
//  BulkLogWorkoutForm (apps/web/src/components/forms/BulkLogWorkoutForm.tsx): add a row per
//  session (member · workout · date · duration) and save them all at once via POST
//  /workout-logs/batch. Faithful to web parity — the admin_only_data_entry mount guard,
//  role-gated member selection, success refresh, and per-row error highlighting.
//
//  Duplicate (member, workout, date) rows — within the batch OR against an existing log — are
//  rejected server-side (409 + rowErrors, field "duplicate"); this view highlights those rows
//  red and shows the message, never silently merging.
//

import SwiftUI

struct BulkAddWorkoutDetailView: View {
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
        /// Server-reported error for this row (e.g. a duplicate collision) — drives the red highlight.
        var backendError: String? = nil
    }

    @State private var rows: [BulkRow] = []
    @State private var nextUid = 0
    @State private var submittedOrder: [Int] = []
    @State private var isSaving = false
    @State private var topErrorMessage: String?

    // Which row + which picker is currently presented.
    @State private var memberPickerRowId: Int?
    @State private var workoutPickerRowId: Int?

    // MARK: - Derived

    private var canSelectAnyMember: Bool {
        programContext.globalRole == "global_admin"
            || programContext.loggedInUserProgramRole == "admin"
            || programContext.loggedInUserProgramRole == "logger"
    }

    private var workoutOptions: [String] {
        if programContext.programId != nil {
            return programContext.programWorkouts.filter { !$0.is_hidden }.map { $0.workout_name }
        }
        return programContext.workouts.map { $0.workout_name }
    }

    private var nonEmptyRows: [BulkRow] { rows.filter { !isEmptyRow($0) } }
    private var validRows: [BulkRow] { nonEmptyRows.filter { isValidRow($0) } }
    private var invalidCount: Int { nonEmptyRows.count - validRows.count }
    private var canSubmit: Bool { !validRows.isEmpty && invalidCount == 0 && !isSaving }
    private var atMax: Bool { rows.count >= Self.maxRows }

    private var distinctMembers: Int { Set(validRows.map { $0.memberId }).count }
    private var totalMinutes: Int { validRows.reduce(0) { $0 + rowDuration($1) } }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpacing.lg) {
                Text("Add a row per session — member, workout, date, and duration — then save them all at once.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

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

                Text("\(validRows.count) \(validRows.count == 1 ? "row" : "rows") • \(distinctMembers) \(distinctMembers == 1 ? "member" : "members") • \(totalMinutes) min total")
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
        .navigationTitle("Bulk add")
        .navigationBarTitleDisplayMode(.inline)
        .adaptiveBackground()
        .task {
            // Web parity: a locked non-admin never sees the form.
            if programContext.dataEntryLocked { dismiss(); return }
            await ensureLookups()
            if rows.isEmpty { addRows(1) }
        }
        .sheet(item: memberPickerBinding) { target in
            SearchablePickerSheet(
                title: "Select member",
                options: programContext.members.map { .init(id: $0.id, label: $0.member_name) },
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
                options: workoutOptions.map { .init(id: $0, label: $0) },
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

            LogFieldLabel("Member")
            memberField(row)

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

    @ViewBuilder
    private func memberField(_ row: BulkRow) -> some View {
        if canSelectAnyMember {
            Button { memberPickerRowId = row.id } label: {
                LogFieldRow(text: row.memberName.isEmpty ? "Select member" : row.memberName,
                            isPlaceholder: row.memberName.isEmpty,
                            systemIcon: "chevron.up.chevron.down")
            }
        } else {
            LogFieldRow(text: row.memberName.isEmpty ? (programContext.loggedInUserName ?? "You") : row.memberName,
                        isPlaceholder: false,
                        systemIcon: "lock.fill",
                        locked: true)
        }
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
        r.memberId.isEmpty && r.workoutName.isEmpty && r.hoursText.isEmpty && r.minutesText.isEmpty
    }

    private func isValidRow(_ r: BulkRow) -> Bool {
        !r.memberId.isEmpty && !r.workoutName.isEmpty && rowMinutes(r) < 60 && rowDuration(r) > 0
    }

    /// Live client-side validation message for a non-empty row (nil when valid or empty).
    private func clientRowError(_ r: BulkRow) -> String? {
        if isEmptyRow(r) { return nil }
        if r.memberId.isEmpty { return "Select a member" }
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
            // Plain members log only for themselves — prefill + lock.
            if !canSelectAnyMember, let userId = programContext.loggedInUserId,
               let me = programContext.members.first(where: { $0.id == userId }) {
                row.memberId = me.id
                row.memberName = me.member_name
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

    // Bindings that route field edits through updateRow (so backend errors clear on edit).
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

    // Sheet item bindings — wrap the active row id in an Identifiable.
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

    // MARK: - Actions

    private func ensureLookups() async {
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || programContext.workouts.isEmpty || needsRefresh {
            await programContext.loadLookupData()
        }
        if programContext.programId != nil {
            await programContext.loadProgramWorkouts()
        }
    }

    private func save() async {
        guard let token = programContext.authToken, let programId = programContext.programId else { return }
        let included = rows.filter { !isEmptyRow($0) && isValidRow($0) }
        guard !included.isEmpty else { return }

        isSaving = true
        topErrorMessage = nil
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
            _ = try await APIClient.shared.addWorkoutLogsBatch(token: token, programId: programId, entries: entries)
            programContext.summaryRefreshToken += 1 // web parity: ≈ invalidateQueries(["summary"])
            dismiss()
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
}
