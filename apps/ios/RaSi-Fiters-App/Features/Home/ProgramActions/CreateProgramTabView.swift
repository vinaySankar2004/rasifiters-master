import SwiftUI

// MARK: - Create Program Tab View

struct CreateProgramTabView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme

    let onCreated: () -> Void

    @State private var programName: String = ""
    @State private var status: String = "planned"
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccessAlert = false

    private let statusOptions = ["planned", "active", "completed"]

    private var isFormValid: Bool {
        !programName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var accentColor: Color {
        Color.appOrange
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    Text("Create Program")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text("Set up a new fitness program.")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }

                // Form fields
                VStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Program name")
                            .font(.subheadline.weight(.semibold))
                        TextField("e.g. Summer 2026 Challenge", text: $programName)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.words)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Status")
                            .font(.subheadline.weight(.semibold))
                        Menu {
                            ForEach(statusOptions, id: \.self) { option in
                                Button(option.capitalized) { status = option }
                            }
                        } label: {
                            HStack {
                                Text(status.capitalized)
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
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                Button(action: { Task { await save() } }) {
                    Group {
                        if isSaving {
                            ProgressView().tint(colorScheme == .dark ? .black : .white)
                        } else {
                            Text("Create Program")
                                .font(.headline.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isFormValid ? accentColor : Color(.systemGray3))
                    .foregroundColor(.black)
                    .cornerRadius(14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!isFormValid || isSaving)

                Spacer(minLength: 40)
            }
            .padding(20)
        }
        .alert("Program Created", isPresented: $showSuccessAlert) {
            Button("OK") {
                onCreated()
            }
        } message: {
            Text("Your new program has been created successfully.")
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        do {
            try await programContext.createProgram(
                name: programName.trimmingCharacters(in: .whitespacesAndNewlines),
                status: status,
                startDate: startDate,
                endDate: endDate
            )
            showSuccessAlert = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
