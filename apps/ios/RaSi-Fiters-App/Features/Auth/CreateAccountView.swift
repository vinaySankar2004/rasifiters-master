import SwiftUI
import AuthenticationServices
import GoogleSignIn

struct CreateAccountView: View {
    /// When set (a `needs_profile` OAuth hand-off from `LoginView`), the view starts in the 2-step
    /// social branch: names + username/gender only (email locked, no password), finishing via
    /// `/auth/oauth/complete`. `nil` = the normal 3-step password sign-up. The view can ALSO enter
    /// social mode in-place when a Google/Apple tap on THIS screen returns `needs_profile`.
    var pendingSocial: PendingSocial? = nil

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
    // Paged-wizard state: current page.
    @State private var step: Int = 0
    // The active federated hand-off (from the init param OR set in-place by a Google/Apple tap here);
    // non-nil ⇒ social mode. `didConfigure` guards the one-time prefill from the init param.
    @State private var social: PendingSocial? = nil
    @State private var didConfigure: Bool = false
    // autoFocus the First Name field on load (matches web D-C5).
    @FocusState private var firstNameFocused: Bool
    private let genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"]

    // Social mode omits the password page (backend owns the federated credential).
    private var isSocial: Bool { social != nil }
    private var pageCount: Int { isSocial ? 2 : 3 }
    private var lastStep: Int { pageCount - 1 }

    var body: some View {
        ZStack {
            AppGradient.background(for: colorScheme)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                NavigationLink(
                    destination: ProgramPickerView()
                        .navigationBarBackButtonHidden(true),
                    isActive: $navigateToProgramPicker
                ) {
                    EmptyView()
                }

                // Real brand icon (matches web; replaces the legacy placeholder).
                BrandMark(size: 64)

                VStack(alignment: .center, spacing: 6) {
                    Text("Create Account")
                        .font(.title.bold())
                        .foregroundColor(Color(.label))

                    Text(isSocial ? "Finish setting up your account" : "Start tracking your fitness journey")
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                }
                .frame(maxWidth: .infinity, alignment: .center)

                // Paged wizard — one field group per page, no inner scroll (each page fits one screen).
                TabView(selection: $step) {
                    namePage.tag(0)
                    detailsPage.tag(1)
                    if !isSocial {
                        passwordPage.tag(2)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.default, value: step)

                pageIndicator

                navButtons

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
                .padding(.bottom, 8)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                EmptyView()
            }
        }
        .onAppear(perform: configureIfNeeded)
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

    // MARK: - Pages

    private var namePage: some View {
        VStack(spacing: 16) {
            AppInputField(title: "First Name", text: $firstName, autocapitalization: .words)
                .focused($firstNameFocused)
            AppInputField(title: "Last Name", text: $lastName, autocapitalization: .words)
            // Federated sign-in — email mode only (hidden once the wizard is in the social branch).
            if !isSocial {
                socialSignInSection
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Social sign-in (Google + Apple) — mirrors LoginView

    private var socialSignInSection: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Rectangle().fill(Color(.separator)).frame(height: 1)
                Text("or")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
                Rectangle().fill(Color(.separator)).frame(height: 1)
            }
            .frame(maxWidth: 240)

            Button(action: { Task { await handleGoogleSignIn() } }) {
                FederatedSignInLabel(title: "Continue with Google") {
                    Image("GoogleG")
                        .resizable()
                        .renderingMode(.original)
                        .frame(width: 18, height: 18)
                }
            }
            .buttonStyle(.plain)
            .disabled(isLoading)

            Button(action: { Task { await handleAppleSignIn() } }) {
                FederatedSignInLabel(title: "Continue with Apple") {
                    Image(systemName: "apple.logo")
                        .font(.system(size: 18))
                }
            }
            .buttonStyle(.plain)
            .disabled(isLoading)
        }
    }

    private var detailsPage: some View {
        VStack(spacing: 16) {
            AppInputField(title: "Username", text: $username)

            genderPicker

            VStack(alignment: .leading, spacing: 6) {
                AppInputField(title: "Email", text: $email)
                    .disabled(isSocial)
                    .opacity(isSocial ? 0.6 : 1)
                if isSocial {
                    // Email is the verified address from the connected account — locked.
                    Text("Email from your connected account.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if !email.isEmpty && !isEmailValid {
                    // Inline email-format validation (matches web D-C1).
                    Text("Enter a valid email address.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
    }

    private var passwordPage: some View {
        VStack(spacing: 16) {
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
                // Live password-policy checklist (matches web D-C3).
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
                    // Muted mismatch hint (matches web D-C4).
                    Text("Passwords don't match.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Wizard chrome

    private var pageIndicator: some View {
        HStack(spacing: 8) {
            ForEach(0..<pageCount, id: \.self) { i in
                Circle()
                    .fill(i == step ? Color(.label) : Color(.systemGray3))
                    .frame(width: 8, height: 8)
            }
        }
    }

    private var navButtons: some View {
        HStack(spacing: 12) {
            if step > 0 {
                Button(action: { withAnimation { step -= 1 } }) {
                    Text("Back")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundColor(Color(.label))
                        .background(
                            Capsule().stroke(Color(.systemGray3), lineWidth: 1)
                        )
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isLoading)
            }

            Button(action: advance) {
                Group {
                    if isLoading {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(colorScheme == .dark ? .black : .white)
                    } else {
                        Text(step == lastStep ? "Create Account" : "Continue")
                            .font(.headline.weight(.semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundColor(colorScheme == .dark ? .black : .white)
                .background(
                    Capsule().fill(Color(.label))
                )
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .adaptiveShadow(radius: 8, y: 4)
            .disabled(!canContinue(step) || isLoading)
        }
        .frame(maxWidth: 320)
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

    // Per-page gate for the Continue button.
    private func canContinue(_ s: Int) -> Bool {
        switch s {
        case 0:
            return !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                   !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case 1:
            return !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && isEmailValid
        case 2:
            return passwordMeetsPolicy && password == confirmPassword
        default:
            return false
        }
    }

    // MARK: - Flow

    private func configureIfNeeded() {
        guard !didConfigure else { return }
        didConfigure = true
        if let pending = pendingSocial {
            enterSocialMode(with: pending)
        }
    }

    /// Switches the wizard into the 2-step social branch in-place (from the init param, or a
    /// Google/Apple `needs_profile` tap on this screen): prefill names (editable) + lock email,
    /// drop the password page, and keep the user within the now-2-page range.
    private func enterSocialMode(with pending: PendingSocial) {
        social = pending
        firstName = pending.firstName ?? firstName
        lastName = pending.lastName ?? lastName
        email = pending.email ?? ""
        // The password page (tag 2) is gone; clamp so the selection can't dangle past the last page.
        if step > lastStep { step = lastStep }
    }

    private func advance() {
        if step < lastStep {
            withAnimation { step += 1 }
        } else if isSocial {
            Task { await handleCompleteSocial() }
        } else {
            Task { await handleCreateAccount() }
        }
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
            await programContext.applyAuthResponse(response)

            navigateToProgramPicker = true
        } catch {
            alertMessage = error.localizedDescription
            isShowingAlert = true
        }
    }

    private func handleCompleteSocial() async {
        guard !isLoading, let pending = social else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await APIClient.shared.completeSocialRegistration(
                pendingToken: pending.token,
                refreshToken: pending.refreshToken,
                username: username,
                gender: gender,
                firstName: firstName,
                lastName: lastName
            )
            await programContext.applyAuthResponse(response)

            navigateToProgramPicker = true
        } catch {
            alertMessage = error.localizedDescription
            isShowingAlert = true
        }
    }

    // MARK: - Federated sign-in handlers (mirror LoginView; needs_profile transitions IN-PLACE)

    @MainActor
    private func handleGoogleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            guard let presenter = AuthPresenter.rootViewController else {
                throw APIError(message: "Unable to present Google sign-in.")
            }
            let idToken = try await programContext.startGoogleSignIn(presenting: presenter)
            let pushToken = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey)
            let response = try await APIClient.shared.socialSignIn(
                provider: "google",
                idToken: idToken,
                pushToken: pushToken
            )
            await handleSocialResponse(response)
        } catch {
            if !isGoogleCancellation(error) {
                alertMessage = error.localizedDescription
                isShowingAlert = true
            }
        }
    }

    @MainActor
    private func handleAppleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let apple = try await programContext.startAppleSignIn()
            let pushToken = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey)
            let response = try await APIClient.shared.socialSignIn(
                provider: "apple",
                idToken: apple.idToken,
                nonce: apple.nonce,
                firstName: apple.firstName,
                lastName: apple.lastName,
                pushToken: pushToken
            )
            await handleSocialResponse(response)
        } catch {
            if !isAppleCancellation(error) {
                alertMessage = error.localizedDescription
                isShowingAlert = true
            }
        }
    }

    /// Branches an OAuth response. Unlike `LoginView` (which pushes CreateAccountView), a brand-new
    /// social user is transitioned INTO the social branch in-place — this IS CreateAccountView — so we
    /// never double-present. An existing member logs straight in via the shared session-write path.
    @MainActor
    private func handleSocialResponse(_ response: AuthResponse) async {
        if response.needsProfile == true {
            withAnimation {
                enterSocialMode(with: PendingSocial(
                    token: response.token,
                    refreshToken: response.refreshToken,
                    email: response.email,
                    firstName: response.firstName,
                    lastName: response.lastName
                ))
            }
        } else {
            await programContext.applyAuthResponse(response)
            navigateToProgramPicker = true
        }
    }

    private func isAppleCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled
    }

    private func isGoogleCancellation(_ error: Error) -> Bool {
        (error as? GIDSignInError)?.code == .canceled
    }
}

#Preview {
    NavigationStack {
        CreateAccountView()
            .environmentObject(ProgramContext())
    }
}
