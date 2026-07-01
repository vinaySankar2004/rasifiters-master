import SwiftUI
import Combine

@MainActor
final class SplashViewModel: ObservableObject {
    @Published var displayedHeadline: String = ""
    @Published var displayedSubheadline: String = ""
    @Published var isCTAVisible: Bool = false
    @Published var isHeadlineComplete: Bool = false

    private let headline = "Hi, welcome to RaSi Fiters"
    private let subheadline = "Track your fitness journey by logging workouts and monitoring your progress!"

    private var hasStarted = false
    private var isSkipped = false

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true

        await type(text: headline) { [weak self] char in
            self?.displayedHeadline.append(char)
        }
        if isSkipped { return }

        withAnimation {
            isHeadlineComplete = true
        }

        try? await Task.sleep(nanoseconds: 400_000_000)

        await type(text: subheadline) { [weak self] char in
            self?.displayedSubheadline.append(char)
        }
        if isSkipped { return }

        try? await Task.sleep(nanoseconds: 300_000_000)

        withAnimation {
            isCTAVisible = true
        }
    }

    func skip() {
        guard !isCTAVisible else { return }
        isSkipped = true
        displayedHeadline = headline
        displayedSubheadline = subheadline
        withAnimation {
            isHeadlineComplete = true
            isCTAVisible = true
        }
    }

    private func type(text: String, characterDelay: UInt64 = 55_000_000, append: @escaping (Character) -> Void) async {
        for char in text {
            if isSkipped { return }
            try? await Task.sleep(nanoseconds: characterDelay)
            if isSkipped { return }
            append(char)
        }
    }
}

struct SplashView: View {
    @StateObject private var viewModel = SplashViewModel()
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            AppGradient.background(for: colorScheme)
                .ignoresSafeArea()

            VStack(spacing: 36) {
                Spacer(minLength: 60)

                VStack(alignment: .leading, spacing: 12) {
                    Text(viewModel.displayedHeadline)
                        .font(.title2.weight(.bold))
                        .foregroundColor(
                            viewModel.isHeadlineComplete
                            ? Color(.secondaryLabel)
                            : Color(.label)
                        )
                        .multilineTextAlignment(.leading)

                    Text(viewModel.displayedSubheadline)
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)

                Spacer()

                // Real brand icon (matches web; replaces the legacy placeholder — web splash F3).
                BrandMark(size: 120)

                Spacer()

                if viewModel.isCTAVisible {
                    NavigationLink {
                        LoginView()
                    } label: {
                        Text("Sign in")
                            .font(.headline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .frame(maxWidth: 240)
                    .foregroundColor(colorScheme == .dark ? .black : .white)
                    .background(
                        Capsule()
                            .fill(Color(.label))
                    )
                    .adaptiveShadow(radius: 8, y: 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 20)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            viewModel.skip()
        }
        .task {
            await viewModel.start()
        }
    }
}

#Preview {
    NavigationStack {
        SplashView()
            .environmentObject(ProgramContext())
    }
}
