import SwiftUI
import UIKit

/// A left-edge swipe-back "hack" for the program-detail area.
///
/// The program shell (AdminHomeView) and every tab root set `.navigationBarBackButtonHidden(true)`, which disables
/// iOS's native edge swipe-back there — leaving no quick way back to the program list. This installs ONE
/// `UIScreenEdgePanGestureRecognizer` on the window while the shell is on screen (removed with it) and, on completion:
///
/// - polish #13: leaves the program (`onRootSwipe`) ONLY from a tab's top screen;
/// - anything above it — a screen pushed on the outer stack (Summary, admin Lifestyle and admin Program have no stack
///   of their own), on the tab's own stack, or a presented sheet / cover — is a normal one-level back: the system
///   swipe-back when it is running (a transition is in flight), otherwise one pop here.
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

    /// Polish #13: the recognizer lives on the WINDOW — remove it when the program shell leaves, so it never outlives
    /// AdminHomeView (or stacks up one per program visit).
    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onRootSwipe: () -> Void
        private weak var hostView: UIView?
        private var recognizer: UIScreenEdgePanGestureRecognizer?

        init(onRootSwipe: @escaping () -> Void) {
            self.onRootSwipe = onRootSwipe
        }

        /// Add the recognizer to the window once the host view is in a window, so it observes edge
        /// pans across the whole program-detail area (not just this zero-size background view).
        func attach(_ recognizer: UIScreenEdgePanGestureRecognizer, to view: UIView) {
            hostView = view
            self.recognizer = recognizer
            DispatchQueue.main.async { [weak self] in
                guard let self, let recognizer = self.recognizer,
                      let target = self.hostView?.window ?? self.hostView else { return }
                target.addGestureRecognizer(recognizer)
            }
        }

        func detach() {
            if let recognizer { recognizer.view?.removeGestureRecognizer(recognizer) }
            recognizer = nil
        }

        @objc func handleEdgePan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
            guard recognizer.state == .ended, isCommitted(recognizer),
                  let root = (recognizer.view?.window ?? UIApplication.shared.keyWindowRoot)?.rootViewController,
                  let tabBar = deepestTabBarController(root) else { return }
            // A sheet / full-screen cover is up: it owns the swipe, never the program shell.
            if root.presentedViewController != nil { return }
            // Something is pushed above the shell on the OUTER stack → one level back, never leave the program.
            if let outer = tabBar.navigationController {
                if outer.transitionCoordinator != nil { return }          // the system swipe-back is already popping
                if let top = outer.topViewController, !isAncestor(top, of: tabBar) {
                    outer.popViewController(animated: true)
                    return
                }
            }
            // Something is pushed on the selected tab's OWN stack → the same.
            if let selected = tabBar.selectedViewController, let inner = firstNavigationController(in: selected) {
                if inner.transitionCoordinator != nil { return }
                if inner.viewControllers.count > 1 {
                    inner.popViewController(animated: true)
                    return
                }
            }
            onRootSwipe()   // a tab's top screen → back to the program list
        }

        /// Like the system swipe-back: a short or reversed edge drag is cancelled — only a drag past a third of the
        /// screen, or a quick flick to the right, goes back (2026-10-13: any tiny edge touch used to leave the program).
        private func isCommitted(_ recognizer: UIScreenEdgePanGestureRecognizer) -> Bool {
            guard let view = recognizer.view else { return false }
            let dx = recognizer.translation(in: view).x
            let vx = recognizer.velocity(in: view).x
            return vx > 500 || (dx > view.bounds.width / 3 && vx >= 0)
        }

        // MARK: - UIGestureRecognizerDelegate

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }

        // MARK: - Hierarchy lookup

        /// `ancestor` is `vc` itself or one of its parents (the outer stack's top hosts the program shell).
        private func isAncestor(_ ancestor: UIViewController, of vc: UIViewController) -> Bool {
            var current: UIViewController? = vc
            while let candidate = current {
                if candidate === ancestor { return true }
                current = candidate.parent
            }
            return false
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
