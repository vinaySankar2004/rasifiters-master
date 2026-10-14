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
    // Measured height of the tallest wizard page's field group. The paged TabView has no intrinsic
    // height, so we pin it to this — without it the TabView is the only flexible child and collapses
    // to ~0 when the keyboard's avoidance inset squeezes the layout (the "fields vanish" bug). The
    // whole screen is now a ScrollView, so the focused field scrolls into view instead of hiding.
    @State private var pageContentHeight: CGFloat = 0
    // The active federated hand-off (from the init param OR set in-place by a Google/Apple tap here);
    // non-nil ⇒ social mode. `didConfigure` guards the one-time prefill from the init param.
    @State private var social: PendingSocial? = nil
    @State private var didConfigure: Bool = false
    // Polish #17 (auth D-C18 in the amendments): a taken username / email shows on the step that owns the field; once
    // the account exists, a retry only signs in — with the credentials it was created with — and steps 1–2 lock.
    @State private var detailsError: String?
    @State private var registered: (username: String, password: String)?
    /// The server's 400 texts for a taken name (authService register + oauth/complete).
    private static let takenMessages: Set<String> = ["Username already exists", "Email already exists"]
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

            // Scrollable so keyboard-avoidance scrolls (not collapses) the form — matches ForgotPasswordView.
            ScrollView {
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

                    // Paged wizard — one field group per page. Pinned to the measured tallest-page height
                    // (see `pageContentHeight`) so it can't collapse under the keyboard.
                    TabView(selection: $step) {
                        namePage.tag(0)
                        detailsPage.tag(1)
                        if !isSocial {
                            passwordPage.tag(2)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .frame(height: pageContentHeight > 0 ? pageContentHeight : 300)
                    .onPreferenceChange(PageContentHeightKey.self) { pageContentHeight = $0 }
                    .animation(.default, value: step)
                    .animation(.default, value: pageContentHeight)

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
                .frame(maxWidth: AdaptiveLayout.formMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                EmptyView()
            }
        }
        .onAppear(perform: configureIfNeeded)
        .onChange(of: username) { detailsError = nil }
        .onChange(of: email) { detailsError = nil }
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
        measuredPage {
            VStack(spacing: 16) {
                AppInputField(title: "First Name", text: $firstName, autocapitalization: .words, contentType: .givenName)
                    .focused($firstNameFocused)
                    .disabled(registered != nil)
                AppInputField(title: "Last Name", text: $lastName, autocapitalization: .words, contentType: .familyName)
                    .disabled(registered != nil)
                // Federated sign-in — email mode only (hidden once the wizard is in the social branch).
                if !isSocial {
                    socialSignInSection
                }
            }
        }
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
        measuredPage {
            VStack(spacing: 16) {
                AppInputField(title: "Username", text: $username, contentType: .username)
                    .disabled(registered != nil)

                genderPicker
                    .disabled(registered != nil)

                VStack(alignment: .leading, spacing: 6) {
                    AppInputField(title: "Email", text: $email, keyboardType: .emailAddress, contentType: .emailAddress)
                        .disabled(isSocial || registered != nil)
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

                if let detailsError {
                    Text(detailsError)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appRed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var passwordPage: some View {
        measuredPage {
            VStack(spacing: 16) {
                AppInputField(
                    title: "Password",
                    text: $password,
                    isSecure: !isPasswordVisible,
                    contentType: .newPassword,
                    accessory: AnyView(AppPasswordToggleButton(isVisible: $isPasswordVisible))
                )

                AppInputField(
                    title: "Confirm Password",
                    text: $confirmPassword,
                    isSecure: !isConfirmPasswordVisible,
                    contentType: .newPassword,
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
            }
        }
    }

    /// Wraps a wizard page's field group: reports its NATURAL content height (so the paged TabView can
    /// be pinned to the tallest page and never collapse) and top-aligns the fields within the page via a
    /// trailing spacer, so fields don't shift vertically as you swipe between pages. The height is
    /// measured on the content itself — not the spacer — so a growing page (e.g. the live password
    /// checklist) enlarges the TabView instead of clipping.
    private func measuredPage<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: PageContentHeightKey.self, value: geo.size.height)
                    }
                )
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
            return
        }
        // Polish #17: the paged TabView can be swiped past a page's checks — re-check every page and jump to the first
        // that fails (not once the account exists: then the tap only signs in).
        if registered == nil, let invalid = (0...lastStep).first(where: { !canContinue($0) }) {
            withAnimation { step = invalid }
            return
        }
        if isSocial {
            Task { await handleCompleteSocial() }
        } else {
            Task { await handleCreateAccount() }
        }
    }

    /// Polish #17: back to the details step with the server's message under the field.
    private func showTaken(_ message: String) {
        detailsError = message
        withAnimation { step = 1 }
    }

    private func showAlert(_ message: String) {
        alertMessage = message
        isShowingAlert = true
    }

    private func handleCreateAccount() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let login: (username: String, password: String)
        if let registered {
            login = registered                                           // #17: the account exists — sign in only
        } else {
            do {
                _ = try await APIClient.shared.registerAccount(firstName: firstName, lastName: lastName, username: username,
                                                                email: email, password: password, gender: gender)
            } catch {
                let message = SessionCopy.credentialMessage(for: error)    // sign-up, not a sign-in: no event
                if Self.takenMessages.contains(message) { showTaken(message) } else { showAlert(message) }
                return
            }
            login = (username, password)
            registered = login
        }
        do {
            let response = try await APIClient.shared.loginGlobal(identifier: login.username, password: login.password)
            try await programContext.applyAuthResponse(response)
            navigateToProgramPicker = true
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "password")
            showAlert("Account created. Please sign in.")              // #17: tapping Create Account again signs in
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
            try await programContext.applyAuthResponse(response)
            DeviceRegistry.shared.register()          // `/oauth/complete` has no registration ride-along (notifications §3.1)
            navigateToProgramPicker = true
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: pending.provider)   // A11
            let message = SessionCopy.credentialMessage(for: error)
            if Self.takenMessages.contains(message) { showTaken(message) } else { showAlert(message) }
        }
    }

    // MARK: - Federated sign-in handlers (mirror LoginView; needs_profile transitions IN-PLACE)

    @MainActor
    private func handleGoogleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let google: (idToken: String, nonce: String)
        do {
            guard let presenter = AuthPresenter.rootViewController else {
                throw APIError(message: "Unable to present Google sign-in.")
            }
            google = try await programContext.startGoogleSignIn(presenting: presenter)
        } catch {
            guard !isGoogleCancellation(error) else { return }
            ClientEventQueue.shared.recordProviderFailure(error, method: "google")
            showAlert(KitCopy.message(for: .unknown))
            return
        }
        do {
            let response = try await APIClient.shared.socialSignIn(provider: "google", idToken: google.idToken, nonce: google.nonce)
            try await handleSocialResponse(response, provider: "google")
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "google")
            showAlert(SessionCopy.credentialMessage(for: error))
        }
    }

    @MainActor
    private func handleAppleSignIn() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let apple: (idToken: String, nonce: String, firstName: String?, lastName: String?)
        do {
            apple = try await programContext.startAppleSignIn()
        } catch {
            guard !isAppleCancellation(error) else { return }
            ClientEventQueue.shared.recordProviderFailure(error, method: "apple")
            showAlert(KitCopy.message(for: .unknown))
            return
        }
        do {
            let response = try await APIClient.shared.socialSignIn(provider: "apple", idToken: apple.idToken, nonce: apple.nonce,
                                                                   firstName: apple.firstName, lastName: apple.lastName)
            try await handleSocialResponse(response, provider: "apple")
        } catch {
            ClientEventQueue.shared.recordSignInFailure(error, method: "apple")
            showAlert(SessionCopy.credentialMessage(for: error))
        }
    }

    /// Branches an OAuth response. Unlike `LoginView` (which pushes CreateAccountView), a brand-new
    /// social user is transitioned INTO the social branch in-place — this IS CreateAccountView — so we
    /// never double-present. An existing member logs straight in via the shared session-write path.
    @MainActor
    private func handleSocialResponse(_ response: AuthResponse, provider: String) async throws {
        if response.needsProfile == true {
            withAnimation {
                enterSocialMode(with: PendingSocial(
                    token: response.token,
                    refreshToken: response.refreshToken,
                    email: response.email,
                    firstName: response.firstName,
                    lastName: response.lastName,
                    provider: provider
                ))
            }
        } else {
            try await programContext.applyAuthResponse(response)
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

/// Max-reduce preference key carrying each wizard page's natural content height, so the paged TabView
/// (which has no intrinsic height) can be pinned to the tallest page and never collapse under the keyboard.
private struct PageContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

#Preview {
    NavigationStack {
        CreateAccountView()
            .environmentObject(ProgramContext())
    }
}
