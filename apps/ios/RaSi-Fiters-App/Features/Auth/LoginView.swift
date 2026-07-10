import SwiftUI
import AuthenticationServices
import GoogleSignIn

struct LoginView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme
    @State private var identifier: String = ""
    @State private var password: String = ""
    @State private var isPasswordVisible: Bool = false
    @State private var isLoading: Bool = false
    @State private var alertMessage: String?
    @State private var isShowingAlert: Bool = false
    @State private var navigateToProgramPicker: Bool = false
    // Federated sign-up hand-off: a `needs_profile` OAuth response pushes CreateAccountView in social mode.
    @State private var pendingSocial: PendingSocial?
    @State private var navigateToCreateAccount: Bool = false
    // Raw Sign-in-with-Apple nonce; its SHA256 is set on the request, the raw value is sent to the backend.
    @State private var currentAppleNonce: String = ""

    var body: some View {
        ZStack {
            AppGradient.background(for: colorScheme)
                .ignoresSafeArea()

            VStack(spacing: 28) {
                NavigationLink(
                    destination: ProgramPickerView()
                        .navigationBarBackButtonHidden(true),
                    isActive: $navigateToProgramPicker
                ) {
                    EmptyView()
                }

                NavigationLink(
                    destination: CreateAccountView(pendingSocial: pendingSocial),
                    isActive: $navigateToCreateAccount
                ) {
                    EmptyView()
                }

                // Real brand icon (matches web; replaces the legacy placeholder).
                BrandMark(size: 90)
                    .padding(.top, 10)
                    .padding(.bottom, 6)

                VStack(alignment: .center, spacing: 10) {
                    Text("Welcome Back")
                        .font(.title.bold())
                        .foregroundColor(Color(.label))

                    Text("Login to access your fitness dashboard")
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                }
                .frame(maxWidth: .infinity, alignment: .center)

                VStack(spacing: 16) {
                    AppInputField(
                        title: "Username or Email",
                        text: $identifier
                    )

                    AppInputField(
                        title: "Password",
                        text: $password,
                        isSecure: !isPasswordVisible,
                        accessory: AnyView(AppPasswordToggleButton(isVisible: $isPasswordVisible))
                    )
                }

                Button(action: { Task { await handleLogin() } }) {
                    Group {
                        if isLoading {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(colorScheme == .dark ? .black : .white)
                        } else {
                            Text("Login")
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
                .disabled(isLoading || identifier.isEmpty || password.isEmpty)

                socialSignInSection

                // Self-service password recovery — the email-request step is native (ForgotPasswordView).
                // The emailed link still opens rasifiters.com/reset-password in the browser to set the new
                // password (that shared page is client-neutral; the set-new-password step isn't duplicated).
                NavigationLink {
                    ForgotPasswordView()
                } label: {
                    Text("Forgot your password?")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appOrange)
                }

                HStack(spacing: 6) {
                    Text("New here?")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))

                    NavigationLink {
                        CreateAccountView()
                    } label: {
                        Text("Create an account")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                    }
                }

                VStack(spacing: 4) {
                    Text("Training hard? Login to track your progress.")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .center)

                    Link("Privacy Policy", destination: APIConfig.privacyPolicyURL)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appOrange)
                }
                .padding(.top, 6)

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 60)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Hide the default title area while keeping the back button.
            ToolbarItem(placement: .principal) {
                EmptyView()
            }
        }
        .alert(isPresented: $isShowingAlert) {
            Alert(
                title: Text("Login"),
                message: Text(alertMessage ?? "Something went wrong."),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    // MARK: - Social sign-in (Google + Apple)

    private var socialSignInSection: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                Rectangle().fill(Color(.separator)).frame(height: 1)
                Text("or")
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
                Rectangle().fill(Color(.separator)).frame(height: 1)
            }
            .frame(maxWidth: 240)

            Button(action: { Task { await handleGoogleSignIn() } }) {
                HStack(spacing: 10) {
                    Image(systemName: "g.circle.fill")
                        .font(.headline)
                    Text("Continue with Google")
                        .font(.headline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .frame(maxWidth: 240)
                .foregroundColor(Color(.label))
                .background(
                    Capsule()
                        .stroke(Color(.systemGray3), lineWidth: 1)
                )
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isLoading)

            SignInWithAppleButton(.signIn) { request in
                let nonce = AppleSignInCoordinator.randomNonceString()
                currentAppleNonce = nonce
                request.requestedScopes = [.fullName, .email]
                request.nonce = AppleSignInCoordinator.sha256(nonce)
            } onCompletion: { result in
                Task { await handleAppleCompletion(result) }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(maxWidth: 240, minHeight: 48)
            .clipShape(Capsule())
            .disabled(isLoading)
        }
    }

    // MARK: - Handlers

    private func handleLogin() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let pushToken = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey)
            let response = try await APIClient.shared.loginGlobal(
                identifier: identifier,
                password: password,
                pushToken: pushToken,
                deviceId: nil
            )
            await programContext.applyAuthResponse(response)

            // Both global_admin and standard users go to ProgramPickerView
            navigateToProgramPicker = true
        } catch {
            alertMessage = error.localizedDescription
            isShowingAlert = true
        }
    }

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
    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard !isLoading else { return }
            isLoading = true
            defer { isLoading = false }
            do {
                let decoded = try AppleSignInCoordinator.decode(authorization)
                let pushToken = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey)
                let response = try await APIClient.shared.socialSignIn(
                    provider: "apple",
                    idToken: decoded.idToken,
                    nonce: currentAppleNonce,
                    firstName: decoded.fullName?.givenName,
                    lastName: decoded.fullName?.familyName,
                    pushToken: pushToken
                )
                await handleSocialResponse(response)
            } catch {
                alertMessage = error.localizedDescription
                isShowingAlert = true
            }
        case .failure(let error):
            if !isAppleCancellation(error) {
                alertMessage = error.localizedDescription
                isShowingAlert = true
            }
        }
    }

    /// Branches an OAuth response: a brand-new social user (needs_profile) is routed to the
    /// CreateAccountView social branch to pick a username; an existing member is logged straight in.
    @MainActor
    private func handleSocialResponse(_ response: AuthResponse) async {
        if response.needsProfile == true {
            pendingSocial = PendingSocial(
                token: response.token,
                refreshToken: response.refreshToken,
                email: response.email,
                firstName: response.firstName,
                lastName: response.lastName
            )
            navigateToCreateAccount = true
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
        LoginView()
            .environmentObject(ProgramContext())
    }
}
