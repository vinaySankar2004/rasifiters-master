import SwiftUI

struct EditProgramInfoView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var programName: String = ""
    @State private var programStatus: String = "Active"
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date()
    @State private var adminOnlyDataEntry: Bool = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccessAlert = false

    // Snapshot of the loaded program — used to skip a no-op PUT (web program/edit D-C3).
    @State private var original: Snapshot?

    private let statusOptions = ["active", "planned", "completed"]

    private struct Snapshot: Equatable {
        let name: String
        let status: String
        let start: String
        let end: String
        let lock: Bool
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var startStr: String { Self.dayFormatter.string(from: startDate) }
    private var endStr: String { Self.dayFormatter.string(from: endDate) }

    // Client-side date-range validation (web program/edit D-C1): end must be after start.
    private var dateRangeError: String? {
        startStr >= endStr ? "End date must be after the start date." : nil
    }

    private var canSave: Bool {
        !programName.trimmingCharacters(in: .whitespaces).isEmpty && dateRangeError == nil && !isSaving
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Edit Program")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text("Update program details")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }

                VStack(spacing: 14) {
                    // Program Name
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Program name")
                            .font(.subheadline.weight(.semibold))
                        TextField("e.g. Winter Fitness Challenge", text: $programName)
                            .autocorrectionDisabled()
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }

                    // Status
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Status")
                            .font(.subheadline.weight(.semibold))
                        Menu {
                            ForEach(statusOptions, id: \.self) { option in
                                Button(option.capitalized) { programStatus = option }
                            }
                        } label: {
                            HStack {
                                Text(programStatus.capitalized)
                                    .foregroundColor(Color(.label))
                                Spacer()
                                Image(systemName: "chevron.up.chevron.down")
                                    .foregroundColor(Color(.tertiaryLabel))
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                        }
                    }

                    // Start Date
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Start date")
                            .font(.subheadline.weight(.semibold))
                        DatePicker("", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .padding(.horizontal)
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }

                    // End Date
                    VStack(alignment: .leading, spacing: 6) {
                        Text("End date")
                            .font(.subheadline.weight(.semibold))
                        DatePicker("", selection: $endDate, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .padding(.horizontal)
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }

                    // Admin-only data entry (web parity — program/edit toggle; legacy iOS omitted it)
                    VStack(alignment: .leading, spacing: 6) {
                        Toggle(isOn: $adminOnlyDataEntry) {
                            Text("Admin-only data entry")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                        }
                        .tint(Color.appOrange)
                        Text("When on, only admins can add, edit, or delete workouts and health logs. Loggers and members are blocked.")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }

                if let dateRangeError {
                    Text(dateRangeError)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                Button(action: { Task { await save() } }) {
                    Group {
                        if isSaving {
                            ProgressView().tint(.white)
                        } else {
                            Text("Save changes")
                                .font(.headline.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(canSave ? Color.appOrange : Color(.systemGray3))
                    .foregroundColor(.black)
                    .cornerRadius(14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!canSave)
            }
            .padding(20)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle("Edit Program")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            programName = programContext.name
            programStatus = programContext.status.lowercased()
            startDate = programContext.startDate
            endDate = programContext.endDate
            adminOnlyDataEntry = programContext.adminOnlyDataEntry
            original = Snapshot(
                name: programName,
                status: programStatus,
                start: startStr,
                end: endStr,
                lock: adminOnlyDataEntry
            )
        }
        .alert("Saved", isPresented: $showSuccessAlert) {
            Button("OK") { dismiss() }
        } message: {
            Text("Program updated successfully")
        }
    }

    private func save() async {
        // Skip a no-op PUT when nothing changed (web program/edit D-C3).
        let current = Snapshot(
            name: programName,
            status: programStatus.lowercased(),
            start: startStr,
            end: endStr,
            lock: adminOnlyDataEntry
        )
        if let original, current == original {
            dismiss()
            return
        }

        isSaving = true
        errorMessage = nil

        do {
            try await programContext.updateProgram(
                name: programName,
                status: programStatus.lowercased(),
                startDate: startDate,
                endDate: endDate,
                adminOnlyDataEntry: adminOnlyDataEntry
            )
            showSuccessAlert = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}

#Preview {
    NavigationStack {
        EditProgramInfoView()
            .environmentObject(ProgramContext())
    }
}
