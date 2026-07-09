//
//  AddDailyHealthDetailView.swift
//  RaSi-Fiters-App
//
//  Summary "Log daily health" card → the unified multi-row daily-health form. The iOS analogue of
//  the web LogDailyHealthForm (batched rebuild): add a row per day — sleep, diet quality, and steps —
//  and save them all at once via POST /daily-health-logs/batch, optionally across several programs.
//
//  Cloned from AddWorkoutsDetailView per DC-5 (upsert against existing rows), DC-6/R-1 (a row is valid
//  with ANY ONE of sleep / diet / steps), and DC-11 (footer). Role behaviour matches the workout form:
//   • Admin / logger / global-admin → a per-row member picker (log for anyone).
//   • Plain member (or a selection that includes a program the user isn't privileged in) → the member
//     column is hidden; every row is implicitly themselves.
//
//  In-batch duplicate (member, date) rows are flagged client-side; the backend UPSERTS against
//  existing rows (health is state, not additive). Nothing saves unless every row is valid.
//

import SwiftUI

struct AddDailyHealthDetailView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    private static let maxRows = 200

    struct BulkRow: Identifiable {
        let id: Int
        var memberId: String = ""
        var memberName: String = ""
        var date: Date = Date()
        var sleepHoursText: String = ""
        var sleepMinutesText: String = ""
        var foodQuality: Int? = nil
        var stepsText: String = ""
        /// Server-reported error for this row — drives the red highlight.
        var backendError: String? = nil
    }

    @State private var rows: [BulkRow] = []
    @State private var nextUid = 0
    @State private var submittedOrder: [Int] = []
    @State private var isSaving = false
    @State private var topErrorMessage: String?
    @State private var selectedProgramIds: Set<String> = []

    @State private var memberPickerRowId: Int?

    // MARK: - Derived

    private var canSelectAnyMember: Bool {
        programContext.globalRole == "global_admin"
            || programContext.loggedInUserProgramRole == "admin"
            || programContext.loggedInUserProgramRole == "logger"
    }

    private func privileged(_ program: APIClient.ProgramDTO) -> Bool {
        programContext.isGlobalAdmin
            || program.my_role?.lowercased() == "admin"
            || program.my_role?.lowercased() == "logger"
    }

    private var memberLocked: Bool {
        selectedProgramIds.contains { id in
            guard let program = programContext.programs.first(where: { $0.id == id }) else { return false }
            return !privileged(program)
        }
    }

    private var effectiveCanSelectAnyMember: Bool { canSelectAnyMember && !memberLocked }

    private var ignoreMember: Bool { !effectiveCanSelectAnyMember }

    private var memberLockHint: String? {
        (canSelectAnyMember && memberLocked)
            ? "You're not an admin or logger in every selected program — logging for yourself only."
            : nil
    }

    private var nonEmptyRows: [BulkRow] { rows.filter { !isEmptyRow($0) } }
    private var validRows: [BulkRow] { nonEmptyRows.filter { isValidRow($0) } }
    private var invalidCount: Int { nonEmptyRows.count - validRows.count }
    private var canSubmit: Bool { !validRows.isEmpty && invalidCount == 0 && !isSaving && !hasClientDuplicate }
    private var atMax: Bool { rows.count >= Self.maxRows }

    private var distinctMembers: Int { Set(validRows.map { $0.memberId }).count }
    private var totalSleepMinutes: Int {
        validRows.reduce(0) { $0 + rowSleepMinutes($1) }
    }
    private var totalSteps: Int {
        validRows.reduce(0) { $0 + (rowSteps($1) ?? 0) }
    }

    private func groupedSteps(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    /// DC-11 footer: "{N} rows • {M} members • {H}h {M}m sleep • {S} steps" — members only when
    /// the member column is visible; sleep/steps segments always shown (0 when none).
    private var summaryLine: String {
        let rowsPart = "\(validRows.count) \(validRows.count == 1 ? "row" : "rows")"
        let h = totalSleepMinutes / 60
        let m = totalSleepMinutes % 60
        let sleepPart = "\(h)h \(m)m sleep"
        let stepsPart = "\(groupedSteps(totalSteps)) steps"
        if effectiveCanSelectAnyMember {
            let membersPart = "\(distinctMembers) \(distinctMembers == 1 ? "member" : "members")"
            return "\(rowsPart) • \(membersPart) • \(sleepPart) • \(stepsPart)"
        }
        return "\(rowsPart) • \(sleepPart) • \(stepsPart)"
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpacing.lg) {
                Text("Add a row per day — sleep, diet quality, and steps — then save them all at once.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                ProgramMultiSelectSection(
                    programs: programContext.programs,
                    currentProgramId: programContext.programId ?? "",
                    selectedIds: $selectedProgramIds,
                    isLocked: { programContext.isDataEntryLocked(programId: $0) },
                    memberLockHint: memberLockHint
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
        .navigationTitle("Log daily health")
        .navigationBarTitleDisplayMode(.inline)
        .adaptiveBackground()
        .task {
            // Web parity: a locked non-admin never sees the form (D-C1).
            if programContext.dataEntryLocked { dismiss(); return }
            if let pid = programContext.programId, selectedProgramIds.isEmpty {
                selectedProgramIds = [pid]
            }
            await ensureLookups()
            if rows.isEmpty { addRows(1) }
        }
        .onChange(of: memberLocked) { _, locked in
            guard locked else { return }
            let selfId = programContext.loggedInUserId ?? ""
            let selfName = programContext.loggedInUserName ?? ""
            for i in rows.indices {
                rows[i].memberId = selfId
                rows[i].memberName = selfName
            }
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

            if effectiveCanSelectAnyMember {
                LogFieldLabel("Member")
                Button { memberPickerRowId = row.id } label: {
                    LogFieldRow(text: row.memberName.isEmpty ? "Select member" : row.memberName,
                                isPlaceholder: row.memberName.isEmpty,
                                systemIcon: "chevron.up.chevron.down")
                }
            }

            LogFieldLabel("Date")
            DatePicker("", selection: bindingForDate(row.id), in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)

            LogFieldLabel("Sleep time")
            HStack(spacing: AppSpacing.md) {
                AppInputField(title: "Hours", text: bindingForSleepHours(row.id), keyboardType: .numberPad)
                AppInputField(title: "Minutes", text: bindingForSleepMinutes(row.id), keyboardType: .numberPad)
            }

            LogFieldLabel("Diet quality")
            Menu {
                ForEach(1...5, id: \.self) { rating in
                    Button("\(rating)") { updateRow(row.id) { $0.foodQuality = rating } }
                }
                if row.foodQuality != nil {
                    Button("Clear", role: .destructive) { updateRow(row.id) { $0.foodQuality = nil } }
                }
            } label: {
                LogFieldRow(text: row.foodQuality.map { "\($0)" } ?? "Select rating (1-5)",
                            isPlaceholder: row.foodQuality == nil,
                            systemIcon: "chevron.up.chevron.down")
            }

            LogFieldLabel("Steps")
            AppInputField(title: "Steps", text: bindingForSteps(row.id), keyboardType: .numberPad)

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

    private func rowSleepHours(_ r: BulkRow) -> Int { Int(r.sleepHoursText) ?? 0 }
    private func rowSleepMinutes(_ r: BulkRow) -> Int { rowSleepHours(r) * 60 + (Int(r.sleepMinutesText) ?? 0) }
    private func rowSteps(_ r: BulkRow) -> Int? {
        let t = r.stepsText.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : Int(t)
    }

    private func hasSleepInput(_ r: BulkRow) -> Bool {
        !r.sleepHoursText.trimmingCharacters(in: .whitespaces).isEmpty
            || !r.sleepMinutesText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func hasStepsInput(_ r: BulkRow) -> Bool {
        !r.stepsText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Combined sleep as fractional hours (nil when no sleep entered or invalid).
    private func rowSleepValue(_ r: BulkRow) -> Double? {
        guard hasSleepInput(r) else { return nil }
        let h = Int(r.sleepHoursText) ?? 0
        let m = Int(r.sleepMinutesText) ?? 0
        guard (0...24).contains(h), (0...59).contains(m) else { return nil }
        let total = Double(h) + Double(m) / 60.0
        guard total >= 0 && total <= 24 else { return nil }
        return total
    }

    private func isSleepValid(_ r: BulkRow) -> Bool {
        !hasSleepInput(r) || rowSleepValue(r) != nil
    }

    private func isStepsValid(_ r: BulkRow) -> Bool {
        !hasStepsInput(r) || (rowSteps(r) != nil && (rowSteps(r) ?? -1) >= 0)
    }

    private func hasAtLeastOneMetric(_ r: BulkRow) -> Bool {
        rowSleepValue(r) != nil || r.foodQuality != nil || (hasStepsInput(r) && rowSteps(r) != nil)
    }

    private func isEmptyRow(_ r: BulkRow) -> Bool {
        let memberEmpty = ignoreMember || r.memberId.isEmpty
        return memberEmpty && !hasSleepInput(r) && r.foodQuality == nil && !hasStepsInput(r)
    }

    private func isValidRow(_ r: BulkRow) -> Bool {
        (ignoreMember || !r.memberId.isEmpty)
            && isSleepValid(r)
            && isStepsValid(r)
            && hasAtLeastOneMetric(r)
    }

    /// Live client-side validation message for a non-empty row (nil when valid or empty).
    private func clientRowError(_ r: BulkRow) -> String? {
        if isEmptyRow(r) { return nil }
        if !ignoreMember && r.memberId.isEmpty { return "Select a member" }
        if !isSleepValid(r) { return "Sleep time must be between 0:00 and 24:00." }
        if !isStepsValid(r) { return "Steps must be a whole number ≥ 0." }
        if !hasAtLeastOneMetric(r) { return "Add sleep, diet quality, or steps." }
        if isDuplicateRow(r) { return "Duplicate date for this member" }
        return nil
    }

    /// Two non-empty rows sharing (member, date) → client-side in-batch duplicate.
    private func isDuplicateRow(_ r: BulkRow) -> Bool {
        guard !isEmptyRow(r) else { return false }
        let key = "\(r.memberId)|\(LogDateFormatter.string(from: r.date))"
        let matches = nonEmptyRows.filter { "\($0.memberId)|\(LogDateFormatter.string(from: $0.date))" == key }
        return matches.count > 1
    }

    private var hasClientDuplicate: Bool {
        var seen = Set<String>()
        for r in nonEmptyRows {
            let key = "\(r.memberId)|\(LogDateFormatter.string(from: r.date))"
            if seen.contains(key) { return true }
            seen.insert(key)
        }
        return false
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
        rows[idx].backendError = nil
    }

    private func removeRow(_ id: Int) {
        rows.removeAll { $0.id == id }
    }

    // Bindings routed through updateRow (so backend errors clear on edit + digits sanitize).
    private func bindingForDate(_ id: Int) -> Binding<Date> {
        Binding(
            get: { rows.first { $0.id == id }?.date ?? Date() },
            set: { newValue in updateRow(id) { $0.date = newValue } }
        )
    }
    private func bindingForSleepHours(_ id: Int) -> Binding<String> {
        Binding(
            get: { rows.first { $0.id == id }?.sleepHoursText ?? "" },
            set: { newValue in updateRow(id) { $0.sleepHoursText = Self.sanitizeDigits(newValue) } }
        )
    }
    private func bindingForSleepMinutes(_ id: Int) -> Binding<String> {
        Binding(
            get: { rows.first { $0.id == id }?.sleepMinutesText ?? "" },
            set: { newValue in updateRow(id) { $0.sleepMinutesText = Self.sanitizeDigits(newValue) } }
        )
    }
    private func bindingForSteps(_ id: Int) -> Binding<String> {
        Binding(
            get: { rows.first { $0.id == id }?.stepsText ?? "" },
            set: { newValue in updateRow(id) { $0.stepsText = String(newValue.filter(\.isNumber)) } }
        )
    }

    private struct RowTarget: Identifiable { let id: Int }
    private var memberPickerBinding: Binding<RowTarget?> {
        Binding(
            get: { memberPickerRowId.map(RowTarget.init) },
            set: { memberPickerRowId = $0?.id }
        )
    }

    // MARK: - Actions

    private static func sanitizeDigits(_ value: String) -> String {
        String(value.filter(\.isNumber).prefix(2))
    }

    private func ensureLookups() async {
        let needsRefresh = programContext.membersProgramId != programContext.programId
        if programContext.members.isEmpty || needsRefresh {
            await programContext.loadLookupData()
        }
        if programContext.programs.isEmpty,
           let token = programContext.authToken, !token.isEmpty,
           let fetched = try? await APIClient.shared.fetchPrograms(token: token) {
            programContext.programs = fetched
        }
    }

    private func save() async {
        guard let token = programContext.authToken, let programId = programContext.programId else { return }
        let included = rows.filter { !isEmptyRow($0) && isValidRow($0) }
        guard !included.isEmpty, !hasClientDuplicate else { return }

        isSaving = true
        topErrorMessage = nil
        submittedOrder = included.map { $0.id }

        let entries = included.map {
            APIClient.BulkHealthEntry(
                member_id: $0.memberId,
                log_date: LogDateFormatter.string(from: $0.date),
                sleep_hours: rowSleepValue($0),
                food_quality: $0.foodQuality,
                steps: rowSteps($0)
            )
        }

        do {
            _ = try await APIClient.shared.addDailyHealthLogsBatch(
                token: token,
                programId: programId,
                programIds: Array(selectedProgramIds),
                entries: entries
            )
            programContext.summaryRefreshToken += 1  // web parity: ≈ invalidateQueries(["summary"])
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
