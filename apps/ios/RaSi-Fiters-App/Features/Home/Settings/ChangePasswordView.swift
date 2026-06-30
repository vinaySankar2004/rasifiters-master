import SwiftUI

/// "Change Password" — the account-menu change-password screen.
/// Faithful 1:1 port of the legacy iOS screen, with the web-parity 5-rule live policy
/// checklist (D-C2, replacing the legacy 6-char hint — matches `/program/password` and the
/// run-51 create-account screen) and the foundation's shared chrome components (D-C3).
struct ChangePasswordView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var newPassword: String = ""
    @State private var confirmPassword: String = ""
    @State private var showPassword: Bool = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccessAlert = false

    // Web policy: ≥8 chars + upper + lower + number, and passwords match (matches the
    // backend authService.validatePassword + the web checklist + run-51 create-account).
    private var passwordMeetsPolicy: Bool {
        newPassword.count >= 8 && hasMatch("[A-Z]") && hasMatch("[a-z]") && hasMatch("[0-9]")
    }

    private var isValid: Bool {
        passwordMeetsPolicy && newPassword == confirmPassword && !confirmPassword.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Change Password")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text("Enter your new password")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }

                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("New password")
                            .font(.subheadline.weight(.semibold))
                        AppInputField(
                            title: "••••••••",
                            text: $newPassword,
                            isSecure: !showPassword,
                            accessory: AnyView(AppPasswordToggleButton(isVisible: $showPassword))
                        )
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Confirm password")
                            .font(.subheadline.weight(.semibold))
                        AppInputField(title: "••••••••", text: $confirmPassword, isSecure: true)
                    }

                    // Live policy checklist (D-C2) — appears on first keystroke, greens per rule.
                    if !newPassword.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            policyRow("At least 8 characters", newPassword.count >= 8)
                            policyRow("An uppercase letter", hasMatch("[A-Z]"))
                            policyRow("A lowercase letter", hasMatch("[a-z]"))
                            policyRow("A number", hasMatch("[0-9]"))
                        }
                    }

                    if !confirmPassword.isEmpty && newPassword != confirmPassword {
                        Text("Passwords do not match")
                            .font(.caption)
                            .foregroundColor(.appRed)
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                AppPrimaryButton(title: "Update Password", isLoading: isSaving) {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity)
                .disabled(!isValid || isSaving)
            }
            .padding(20)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle("Change Password")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Password Updated", isPresented: $showSuccessAlert) {
            Button("OK") { dismiss() }
        } message: {
            Text("Your password has been changed successfully")
        }
    }

    private func policyRow(_ label: String, _ satisfied: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: satisfied ? "checkmark.circle.fill" : "circle")
                .font(.footnote)
                .foregroundColor(satisfied ? .appGreen : Color(.secondaryLabel))
            Text(label)
                .font(.footnote)
                .foregroundColor(satisfied ? Color(.label) : Color(.secondaryLabel))
        }
    }

    private func hasMatch(_ pattern: String) -> Bool {
        newPassword.range(of: pattern, options: .regularExpression) != nil
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        do {
            try await programContext.changePassword(newPassword: newPassword)
            showSuccessAlert = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
