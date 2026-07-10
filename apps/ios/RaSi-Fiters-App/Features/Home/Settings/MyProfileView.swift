import SwiftUI
import AuthenticationServices
import GoogleSignIn

/// "My Profile" — the account-menu profile screen (ProgramMyAccountSection → My Profile).
/// Faithful 1:1 port of the legacy iOS screen (first/last name + gender + delete account),
/// PLUS the web-parity email-change form (D-C1) the legacy iOS lacked, and the foundation's
/// shared chrome components (D-C3). Matches the built web `/program/profile`.
struct MyProfileView: View {
    @EnvironmentObject var programContext: ProgramContext

    @State private var firstName: String = ""
    @State private var lastName: String = ""
    @State private var gender: String = ""
    @State private var didEditGender = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showSuccessAlert = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false

    // Email change (web-parity ADD, D-C1) — collapsible, direct, password-confirmed. Its own
    // state + messages so it never collides with the name/gender Save flow above.
    @State private var currentEmail: String?
    @State private var showEmailForm = false
    @State private var newEmail: String = ""
    @State private var emailPassword: String = ""
    @State private var isChangingEmail = false
    @State private var emailError: String?
    @State private var showEmailSuccess = false

    // Sign-in methods (auth phase-2, D-C10)
    @State private var identities: [IdentitiesResponse.Identity] = []
    @State private var hasPassword = true
    @State private var linkError: String?
    @State private var isLinking = false
    @State private var showPasswordForm = false
    @State private var newAccountPassword = ""
    @State private var isSettingPassword = false

    private let genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                profileHeader

                Divider()

                // Editable Fields
                VStack(alignment: .leading, spacing: 14) {
                    fieldLabelled("First name") {
                        AppInputField(title: "Enter first name", text: $firstName, autocapitalization: .words)
                    }
                    fieldLabelled("Last name") {
                        AppInputField(title: "Enter last name", text: $lastName, autocapitalization: .words)
                    }
                    fieldLabelled("Gender") { genderPicker }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                AppPrimaryButton(title: "Save changes", isLoading: isSaving) {
                    Task { await save() }
                }
                .frame(maxWidth: .infinity)
                .disabled(isSaving)

                emailSection

                signInMethodsSection

                // Delete Account Section
                if !programContext.isGlobalAdmin {
                    VStack(spacing: 8) {
                        Divider()
                            .padding(.bottom, 8)

                        AppDestructiveButton(title: "Delete Account", isLoading: isDeleting) {
                            showDeleteConfirmation = true
                        }
                        .disabled(isDeleting)

                        Text("This will permanently delete your account and all associated data.")
                            .font(.caption)
                            .foregroundColor(Color(.tertiaryLabel))
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.top, 20)
                }
            }
            .padding(20)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Saved", isPresented: $showSuccessAlert) {
            Button("OK") {}
        } message: {
            Text("Profile updated successfully")
        }
        .alert("Delete Account?", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deleteAccount() }
            }
        } message: {
            Text("This action cannot be undone. All your data, including workout logs, health logs, and program memberships will be permanently deleted.")
        }
        .onAppear {
            // Initialize fields from current values (faithful — name/gender from session state)
            if let name = programContext.loggedInUserName {
                let parts = name.split(separator: " ", maxSplits: 1)
                firstName = parts.first.map(String.init) ?? ""
                lastName = parts.count > 1 ? String(parts[1]) : ""
            }
            gender = programContext.loggedInUserGender ?? ""
        }
        .onChange(of: programContext.loggedInUserGender) { _, newValue in
            guard !didEditGender else { return }
            gender = newValue ?? ""
        }
        .task {
            // Web-parity ADD: fetch the current email for display (GET /members/:id).
            await loadCurrentEmail()
            await loadIdentities()
        }
    }

    // MARK: - Sections

    private var profileHeader: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.appOrangeLight)
                    .frame(width: 70, height: 70)
                Text(initials)
                    .font(.title2.weight(.bold))
                    .foregroundColor(.appOrange)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(fullName)
                    .font(.title3.weight(.bold))
                Text("@\(programContext.loggedInUsername ?? "")")
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Text(programContext.isGlobalAdmin ? "Global Admin" : (programContext.isProgramAdmin ? "Program Admin" : "Member"))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.appOrange)
            }
        }
    }

    @ViewBuilder
    private var emailSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Email")
                        .font(.subheadline.weight(.semibold))
                    Text(currentEmail?.isEmpty == false ? currentEmail! : "—")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                Button(showEmailForm ? "Cancel" : "Change email") {
                    showEmailForm.toggle()
                    emailError = nil
                    showEmailSuccess = false
                    newEmail = ""
                    emailPassword = ""
                }
                .font(.footnote.weight(.semibold))
                .foregroundColor(.appOrange)
            }

            if showEmailSuccess {
                Text("Email updated successfully.")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appGreen)
            }

            if showEmailForm {
                VStack(alignment: .leading, spacing: 10) {
                    fieldLabelled("New email") {
                        AppInputField(title: "you@example.com", text: $newEmail)
                            .keyboardType(.emailAddress)
                    }
                    fieldLabelled("Current password") {
                        AppInputField(title: "Current password", text: $emailPassword, isSecure: true)
                    }

                    if let emailError {
                        Text(emailError)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appRed)
                    }

                    AppPrimaryButton(title: "Update email", isLoading: isChangingEmail) {
                        Task { await changeEmail() }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(!canSubmitEmail)
                }
            }
        }
    }

    @ViewBuilder
    private var signInMethodsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Text("Sign-in methods").font(.subheadline.weight(.semibold))

            providerRow(provider: "google", label: "Google")
            providerRow(provider: "apple", label: "Apple")

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Password").font(.subheadline.weight(.semibold))
                    Text(hasPassword ? "Enabled" : "Not set").font(.subheadline).foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                if !hasPassword {
                    Button(showPasswordForm ? "Cancel" : "Add password") {
                        showPasswordForm.toggle(); linkError = nil; newAccountPassword = ""
                    }.font(.footnote.weight(.semibold)).foregroundColor(.appOrange)
                }
            }

            if showPasswordForm && !hasPassword {
                AppInputField(title: "New password", text: $newAccountPassword, isSecure: true)
                Text("At least 8 characters with an uppercase, a lowercase, and a number.")
                    .font(.caption).foregroundColor(Color(.tertiaryLabel))
                AppPrimaryButton(title: "Save password", isLoading: isSettingPassword) {
                    Task { await addPassword() }
                }.frame(maxWidth: .infinity).disabled(!isNewPasswordValid || isSettingPassword)
            }

            if let linkError {
                Text(linkError).font(.footnote.weight(.semibold)).foregroundColor(.appRed)
            }
        }
    }

    @ViewBuilder
    private func providerRow(provider: String, label: String) -> some View {
        let linked = identities.contains { $0.provider == provider }
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.semibold))
                Text(linked ? (identities.first { $0.provider == provider }?.email ?? "Linked") : "Not linked")
                    .font(.subheadline).foregroundColor(Color(.secondaryLabel)).lineLimit(1).truncationMode(.middle)
            }
            Spacer()
            Button(linked ? "Unlink" : "Link") {
                Task { await toggleProvider(provider, linked: linked) }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(.appOrange)
            .disabled(isLinking || (linked && identities.count <= 1))
        }
    }

    private var isNewPasswordValid: Bool {
        newAccountPassword.range(of: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$", options: .regularExpression) != nil
    }

    private func loadIdentities() async {
        do { apply(try await programContext.fetchIdentities()) } catch { /* faithful-swallow: section still usable */ }
    }

    private func apply(_ r: IdentitiesResponse) {
        identities = r.identities
        hasPassword = r.hasPassword
    }

    private func toggleProvider(_ provider: String, linked: Bool) async {
        isLinking = true; linkError = nil
        defer { isLinking = false }
        do {
            if linked {
                apply(try await programContext.unlink(provider: provider))
            } else {
                apply(try await (provider == "apple" ? programContext.linkApple() : programContext.linkGoogle()))
            }
        } catch {
            if !isCancellation(error) { linkError = error.localizedDescription }
        }
    }

    private func addPassword() async {
        isSettingPassword = true; linkError = nil
        defer { isSettingPassword = false }
        do {
            apply(try await programContext.setPassword(newPassword: newAccountPassword))
            showPasswordForm = false; newAccountPassword = ""
        } catch { linkError = error.localizedDescription }
    }

    private func isCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled || (error as? GIDSignInError)?.code == .canceled
    }

    private var genderPicker: some View {
        Menu {
            ForEach(genderOptions, id: \.self) { option in
                Button(option) {
                    gender = option
                    didEditGender = true
                }
            }
            Button("Clear") {
                gender = ""
                didEditGender = true
            }
        } label: {
            HStack {
                Text(gender.isEmpty ? "Select gender" : gender)
                    .foregroundColor(gender.isEmpty ? Color(.tertiaryLabel) : Color(.label))
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding(.horizontal, AppSpacing.mdl)
            .padding(.vertical, AppSpacing.md)
            .background(
                RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                    .stroke(Color(.systemGray3), lineWidth: 1)
            )
        }
    }

    private func fieldLabelled<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            content()
        }
    }

    // MARK: - Derived

    private var fullName: String {
        let name = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? (programContext.loggedInUserName ?? "") : name
    }

    private var initials: String {
        let first = firstName.first.map { String($0).uppercased() } ?? ""
        let last = lastName.first.map { String($0).uppercased() } ?? ""
        let computed = "\(first)\(last)"
        return computed.isEmpty ? programContext.loggedInUserInitials : computed
    }

    private var isNewEmailValid: Bool {
        let trimmed = newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
    }

    private var canSubmitEmail: Bool {
        isNewEmailValid && !emailPassword.isEmpty && !isChangingEmail
    }

    // MARK: - Actions

    private func loadCurrentEmail() async {
        guard let token = programContext.authToken, !token.isEmpty,
              let userId = programContext.loggedInUserId else { return }
        do {
            let member = try await APIClient.shared.fetchMemberById(token: token, memberId: userId)
            currentEmail = member.email
        } catch {
            // Faithful-swallow: web also surfaces no error for the read; the form still works.
        }
    }

    private func changeEmail() async {
        guard canSubmitEmail else { return }
        isChangingEmail = true
        emailError = nil

        do {
            let updated = try await programContext.changeEmail(
                newEmail: newEmail.trimmingCharacters(in: .whitespacesAndNewlines),
                password: emailPassword
            )
            currentEmail = updated ?? newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
            showEmailSuccess = true
            showEmailForm = false
            newEmail = ""
            emailPassword = ""
        } catch {
            emailError = error.localizedDescription
        }

        isChangingEmail = false
    }

    private func deleteAccount() async {
        isDeleting = true
        errorMessage = nil

        do {
            try await programContext.deleteAccount()
            // After successful deletion, signOut is called automatically,
            // which triggers navigation back to login.
        } catch {
            errorMessage = error.localizedDescription
            isDeleting = false
        }
    }

    private func save() async {
        guard let userId = programContext.loggedInUserId else { return }

        let trimmedFirst = firstName.trimmingCharacters(in: .whitespaces)
        let trimmedLast = lastName.trimmingCharacters(in: .whitespaces)

        if trimmedFirst.isEmpty {
            errorMessage = "First name is required"
            return
        }
        if trimmedLast.isEmpty {
            errorMessage = "Last name is required"
            return
        }

        isSaving = true
        errorMessage = nil

        do {
            try await programContext.updateMemberProfile(
                memberId: userId,
                firstName: trimmedFirst,
                lastName: trimmedLast,
                gender: gender.isEmpty ? nil : gender
            )
            showSuccessAlert = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
