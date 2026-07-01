import SwiftUI
import UIKit

/// A left-edge swipe-back "hack" for the program-detail area.
///
/// Every screen inside a program sets `.navigationBarBackButtonHidden(true)`, which also disables
/// iOS's native edge swipe-back gesture — leaving no quick way back to the program list. This installs
/// a single `UIScreenEdgePanGestureRecognizer` (the same recognizer iOS uses for native swipe-back) and,
/// on completion, inspects the currently selected tab's nested navigation stack:
///
/// - a sub-screen is pushed (`viewControllers.count > 1`) → pop one level (normal back);
/// - at the tab root → run `onRootSwipe` (which returns to the program list).
///
/// Because it only fires from the very screen edge, it does not conflict with the in-content
/// horizontal `DragGesture` scrubbing used by the summary/timeline charts.
extension View {
    func edgeSwipeToReturn(perform action: @escaping () -> Void) -> some View {
        background(EdgeSwipeToReturnInstaller(onRootSwipe: action))
    }
}

private struct EdgeSwipeToReturnInstaller: UIViewRepresentable {
    let onRootSwipe: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onRootSwipe: onRootSwipe)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false // never intercept content touches itself

        let recognizer = UIScreenEdgePanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleEdgePan(_:))
        )
        recognizer.edges = .left
        recognizer.delegate = context.coordinator
        context.coordinator.attach(recognizer, to: view)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onRootSwipe = onRootSwipe
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onRootSwipe: () -> Void
        private weak var hostView: UIView?

        init(onRootSwipe: @escaping () -> Void) {
            self.onRootSwipe = onRootSwipe
        }

        /// Add the recognizer to the window once the host view is in a window, so it observes edge
        /// pans across the whole program-detail area (not just this zero-size background view).
        func attach(_ recognizer: UIScreenEdgePanGestureRecognizer, to view: UIView) {
            hostView = view
            DispatchQueue.main.async { [weak self] in
                guard let self, let target = self.hostView?.window ?? self.hostView else { return }
                target.addGestureRecognizer(recognizer)
            }
        }

        @objc func handleEdgePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
            guard recognizer.state == .ended else { return }
            guard let nav = activeTabNavigationController(from: recognizer.view) else {
                onRootSwipe()
                return
            }
            if nav.viewControllers.count > 1 {
                nav.popViewController(animated: true)
            } else {
                onRootSwipe()
            }
        }

        // MARK: - UIGestureRecognizerDelegate

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }

        // MARK: - Hierarchy lookup

        /// The nested navigation controller backing the currently selected tab, if any.
        private func activeTabNavigationController(from view: UIView?) -> UINavigationController? {
            guard let root = (view?.window ?? UIApplication.shared.keyWindowRoot)?.rootViewController
            else { return nil }
            guard let tabBar = deepestTabBarController(root) else { return nil }
            guard let selected = tabBar.selectedViewController else { return nil }
            return firstNavigationController(in: selected)
        }

        /// Deepest visible `UITabBarController` reachable through children/presented VCs — the program
        /// detail's `TabView`, even when other content sits above it in the outer navigation stack.
        private func deepestTabBarController(_ vc: UIViewController) -> UITabBarController? {
            var found: UITabBarController? = vc as? UITabBarController
            for child in vc.children {
                if let deeper = deepestTabBarController(child) { found = deeper }
            }
            if let presented = vc.presentedViewController,
               let deeper = deepestTabBarController(presented) {
                found = deeper
            }
            return found
        }

        /// The `UINavigationController` for a tab — the VC itself or its first descendant.
        private func firstNavigationController(in vc: UIViewController) -> UINavigationController? {
            if let nav = vc as? UINavigationController { return nav }
            for child in vc.children {
                if let nav = firstNavigationController(in: child) { return nav }
            }
            return nil
        }
    }
}

private extension UIApplication {
    var keyWindowRoot: UIWindow? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
    }
}
