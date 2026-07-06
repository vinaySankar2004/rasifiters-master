import SwiftUI

struct CreateAccountView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var firstName: String = ""
    @State private var lastName: String = ""
    @State private var username: String = ""
    @State private var email: String = ""
    @State private var gender: String = ""
    @State private var password: String = ""
    @State private var confirmPassword: String = ""
    @State private var isPasswordVisible: Bool = false
    @State private var isConfirmPasswordVisible: Bool = false
    @State private var isLoading: Bool = false
    @State private var alertMessage: String?
    @State private var isShowingAlert: Bool = false
    @State private var navigateToProgramPicker: Bool = false
    // autoFocus the First Name field on load (matches web D-C5).
    @FocusState private var firstNameFocused: Bool
    private let genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"]

    var body: some View {
        ZStack {
            AppGradient.background(for: colorScheme)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    NavigationLink(
                        destination: ProgramPickerView()
                            .navigationBarBackButtonHidden(true),
                        isActive: $navigateToProgramPicker
                    ) {
                        EmptyView()
                    }

                    // Real brand icon (matches web; replaces the legacy placeholder).
                    BrandMark(size: 90)
                        .padding(.top, 10)
                        .padding(.bottom, 6)

                    VStack(alignment: .center, spacing: 10) {
                        Text("Create Account")
                            .font(.title.bold())
                            .foregroundColor(Color(.label))

                        Text("Start tracking your fitness journey")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .frame(maxWidth: .infinity, alignment: .center)

                    VStack(spacing: 16) {
                        AppInputField(title: "First Name", text: $firstName, autocapitalization: .words)
                            .focused($firstNameFocused)
                        AppInputField(title: "Last Name", text: $lastName, autocapitalization: .words)
                        AppInputField(title: "Username", text: $username)

                        VStack(alignment: .leading, spacing: 6) {
                            AppInputField(title: "Email", text: $email)
                            // Inline email-format validation (matches web D-C1) — muted hint when
                            // typed-but-invalid; legacy iOS checked non-empty only.
                            if !email.isEmpty && !isEmailValid {
                                Text("Enter a valid email address.")
                                    .font(.footnote)
                                    .foregroundColor(Color(.secondaryLabel))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        genderPicker

                        AppInputField(
                            title: "Password",
                            text: $password,
                            isSecure: !isPasswordVisible,
                            accessory: AnyView(AppPasswordToggleButton(isVisible: $isPasswordVisible))
                        )

                        AppInputField(
                            title: "Confirm Password",
                            text: $confirmPassword,
                            isSecure: !isConfirmPasswordVisible,
                            accessory: AnyView(AppPasswordToggleButton(isVisible: $isConfirmPasswordVisible))
                        )

                        VStack(spacing: 8) {
                            // Live password-policy checklist (matches web D-C3) — appears on the
                            // first keystroke and greens per satisfied rule, replacing the legacy
                            // always-visible static hint line.
                            if !password.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    policyRow("At least 8 characters", password.count >= 8)
                                    policyRow("An uppercase letter", hasMatch("[A-Z]"))
                                    policyRow("A lowercase letter", hasMatch("[a-z]"))
                                    policyRow("A number", hasMatch("[0-9]"))
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }

                            if !confirmPassword.isEmpty && confirmPassword != password {
                                // Muted mismatch hint (matches web D-C4) — was legacy's red text.
                                Text("Passwords don't match.")
                                    .font(.footnote)
                                    .foregroundColor(Color(.secondaryLabel))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }

                    Button(action: { Task { await handleCreateAccount() } }) {
                        Group {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(.circular)
                                    .tint(colorScheme == .dark ? .black : .white)
                            } else {
                                Text("Create Account")
                                    .font(.headline.weight(.semibold))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .frame(maxWidth: 240)
                        .foregroundColor(colorScheme == .dark ? .black : .white)
                        .background(
                            Capsule()
                                .fill(Color(.label))
                        )
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .adaptiveShadow(radius: 8, y: 4)
                    .disabled(!canSubmit || isLoading)

                    VStack(spacing: 6) {
                        Text("By creating an account, you accept our")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))

                        Link("Privacy Policy", destination: APIConfig.privacyPolicyURL)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                    }

                    Button(action: { dismiss() }) {
                        Text("Already have an account? Sign in")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .buttonStyle(.plain)

                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 20)
                .padding(.top, 40)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                EmptyView()
            }
        }
        .task {
            // Brief beat so the field is mounted before focusing (autoFocus, D-C5).
            try? await Task.sleep(nanoseconds: 350_000_000)
            firstNameFocused = true
        }
        .alert(isPresented: $isShowingAlert) {
            Alert(
                title: Text("Create Account"),
                message: Text(alertMessage ?? "Something went wrong."),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    private var genderPicker: some View {
        Menu {
            ForEach(genderOptions, id: \.self) { option in
                Button(option) { gender = option }
            }
        } label: {
            HStack {
                Text(gender.isEmpty ? "Gender (optional)" : gender)
                    .foregroundColor(gender.isEmpty ? Color(.secondaryLabel) : Color(.label))
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .foregroundColor(Color(.secondaryLabel))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color(.systemGray3), lineWidth: 1)
            )
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
        password.range(of: pattern, options: .regularExpression) != nil
    }

    private var isEmailValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
    }

    private var passwordMeetsPolicy: Bool {
        guard password.count >= 8 else { return false }
        return hasMatch("[A-Z]") && hasMatch("[a-z]") && hasMatch("[0-9]")
    }

    private var canSubmit: Bool {
        !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        isEmailValid &&
        passwordMeetsPolicy &&
        password == confirmPassword
    }

    private func handleCreateAccount() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.registerAccount(
                firstName: firstName,
                lastName: lastName,
                username: username,
                email: email,
                password: password,
                gender: gender
            )

            let response = try await APIClient.shared.loginGlobal(identifier: username, password: password)
            let role = (response.globalRole ?? "").lowercased()

            programContext.authToken = response.token
            programContext.refreshToken = response.refreshToken
            programContext.globalRole = role.isEmpty ? "standard" : role
            programContext.loggedInUserId = response.memberId
            programContext.loggedInUsername = response.username
            if let name = response.memberName {
                programContext.loggedInUserName = name
                programContext.adminName = name
            } else if let uname = response.username {
                programContext.loggedInUserName = uname
                programContext.adminName = uname
            }
            await programContext.loadLookupData()
            programContext.persistSession()

            navigateToProgramPicker = true
        } catch {
            alertMessage = error.localizedDescription
            isShowingAlert = true
        }
    }
}

#Preview {
    NavigationStack {
        CreateAccountView()
            .environmentObject(ProgramContext())
    }
}
