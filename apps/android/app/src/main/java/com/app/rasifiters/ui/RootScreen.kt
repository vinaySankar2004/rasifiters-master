package com.app.rasifiters.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.VersionGate
import com.app.rasifiters.core.WidgetRoute
import com.app.rasifiters.ui.auth.CreateAccountScreen
import com.app.rasifiters.ui.auth.ForgotPasswordScreen
import com.app.rasifiters.ui.auth.LoginScreen
import com.app.rasifiters.ui.auth.SplashScreen
import com.app.rasifiters.ui.components.NotificationModal
import com.app.rasifiters.ui.components.UpdateRequiredScreen
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.health.HealthConnectSettingsScreen
import com.app.rasifiters.ui.health.HealthSyncConfirmationScreen
import com.app.rasifiters.ui.program.AppearanceScreen
import com.app.rasifiters.ui.program.ChangePasswordScreen
import com.app.rasifiters.ui.program.MyProfileScreen
import com.app.rasifiters.ui.program.NotificationsScreen
import com.app.rasifiters.ui.programs.ProgramPickerScreen
import com.app.rasifiters.ui.shell.AppScaffold
import com.app.rasifiters.ui.summary.QuickAddHealthWidgetScreen
import com.app.rasifiters.ui.summary.QuickAddWorkoutWidgetScreen
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Root auth gate — the analog of iOS AppRootView / web middleware+useAuthGuard.
 * Signed in (the ONE token store) → the per-program app shell; else → the auth (logged-out) graph.
 * A successful login/register flips `isSignedIn`, so the root swaps to the shell (no explicit nav). Also hosts the
 * foreground lifecycle (stream, push registration, health triggers, version gate) and the app-wide overlays.
 */
@Composable
fun RootScreen(programContext: ProgramContext, appearanceStore: AppearanceStore, versionGate: VersionGate) {
    val signedIn by programContext.isSignedIn.collectAsStateWithLifecycle()
    // The ONE connectivity monitor's combined state (link up && not proven offline, polish-1) — the root offline banners.
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val updateRequired by versionGate.required.collectAsStateWithLifecycle()
    val notificationQueue by programContext.notificationQueue.collectAsStateWithLifecycle()
    val pendingHealthConfirmation by programContext.health.pendingConfirmation.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current

    // notifications §3.1 + board §3.5: POST_NOTIFICATIONS asked ONCE (flag in no-backup rasi.push), right after the first
    // sign-in (Android 13+); the answer re-runs the registration. Settings fallback = NotificationsScreen.
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        programContext.registerPushTokenIfNeeded()
    }
    LaunchedEffect(signedIn) {
        if (signedIn && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            programContext.shouldAskNotificationPermission()
        ) {
            programContext.markNotificationPermissionAsked()
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Foreground lifecycle: ON_START → version gate (signed in or out) + stream + registration + health (`launch` on this
    // state's first start, else `foreground`) + event flush; ON_STOP → close the stream (foreground only, §3.3).
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, signedIn) {
        var firstStart = true
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    scope.launch { versionGate.check() }
                    programContext.onForeground(if (firstStart) "launch" else "foreground")
                    firstStart = false
                }
                Lifecycle.Event.ON_STOP -> programContext.onBackground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(onTap = { focusManager.clearFocus() })
            },
    ) {
        // A7: while the blocking update screen shows, neither graph is composed — no sheet / dialog window (each its own
        // window) can sit above it.
        when {
            updateRequired -> Unit
            !signedIn -> AuthGraph(programContext, online)
            else -> SignedInGraph(programContext, appearanceStore, versionGate, online)
        }

        // The single-notification modal queue, shown above the whole app (iOS AppRootView ZStack overlay). A Dialog is
        // its own window, so it is withheld while the blocking update screen shows (A7).
        if (!updateRequired) {
            notificationQueue.firstOrNull()?.let { notification ->
                NotificationModal(
                    title = notification.title,
                    message = notification.body,
                    onAcknowledge = { scope.launch { programContext.acknowledgeNotification(notification) } },
                )
            }
        }

        // First-time Health Connect sync confirmation — a full-screen overlay above everything (iOS
        // AppRootView fullScreenCover). Dismiss (system back) defers; the tick commits + advances.
        pendingHealthConfirmation?.let { confirmation ->
            HealthSyncConfirmationScreen(
                programContext = programContext,
                confirmation = confirmation,
                onFinished = { committed -> programContext.health.finishConfirmation(confirmation.flow, committed) },
            )
        }

        // app-config §3: blocking "Update required" (min version / any 426) — the last child, above everything.
        if (updateRequired) UpdateRequiredScreen(onUpdate = { versionGate.openStore(context) })
    }
}

/** Signed-in navigation graph: the program picker (landing) → the per-program tab shell. */
@Composable
private fun SignedInGraph(
    programContext: ProgramContext,
    appearanceStore: AppearanceStore,
    versionGate: VersionGate,
    online: Boolean,
) {
    val nav = rememberNavController()
    // A6: the picker and the program shell place the offline banner themselves (their own bottom chrome); every other
    // signed-in screen gets it here, with the content lifted clear of it.
    val route = nav.currentBackStackEntryAsState().value?.destination?.route
    val rootBanner = !online && route != null && route != Routes.PROGRAM_PICKER && route != Routes.SHELL

    // Widget quick-add deep-link (iOS AppRootView `.fullScreenCover(item: widgetRoute)` analog). A route
    // stashed by MainActivity — possibly while signed out (stash-and-replay, O2) — is replayed the moment
    // this graph mounts. Consumed once (cleared right after navigating) so a re-tap can't double-present.
    val widgetRoute by programContext.widgetRoute.collectAsStateWithLifecycle()
    fun exitToMyPrograms() {
        programContext.clearWidgetRoute()
        programContext.clearActiveProgram()
        nav.navigate(Routes.PROGRAM_PICKER) {
            popUpTo(Routes.PROGRAM_PICKER) { inclusive = true }
        }
    }
    LaunchedEffect(widgetRoute) {
        val pending = widgetRoute ?: return@LaunchedEffect
        // app-config §3: gate before the widget deep link — bounded so a weak network never stalls the tap (A7).
        withTimeoutOrNull(WIDGET_GATE_TIMEOUT_MS) { versionGate.check() }
        if (versionGate.required.value) { programContext.clearWidgetRoute(); return@LaunchedEffect }
        when (pending) {
            WidgetRoute.QUICK_ADD_WORKOUT -> nav.navigate(Routes.WIDGET_LOG_WORKOUT) { launchSingleTop = true }
            WidgetRoute.QUICK_ADD_HEALTH -> nav.navigate(Routes.WIDGET_LOG_HEALTH) { launchSingleTop = true }
        }
        programContext.clearWidgetRoute()
    }

    // Invite push tap (notifications §3.2, U2): pop back to the picker, which opens the actions sheet on its invites tab.
    val inviteInboxRequest by programContext.inviteInboxRequest.collectAsStateWithLifecycle()
    LaunchedEffect(inviteInboxRequest) {
        if (inviteInboxRequest) nav.popBackStack(Routes.PROGRAM_PICKER, inclusive = false)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(navController = nav, startDestination = Routes.PROGRAM_PICKER, modifier = Modifier.offlineReserve(rootBanner)) {
            composable(Routes.PROGRAM_PICKER) {
                ProgramPickerScreen(
                    programContext = programContext,
                    onOpenProgram = { program ->
                        programContext.selectProgram(program)
                        nav.navigate(Routes.SHELL)
                    },
                    // Account-sheet destinations (My Profile / Change Password / Appearance / Notifications)
                    // reuse the Program-tab settings screens, reachable from the picker before any program is open.
                    onNavigate = { route -> nav.navigate(route) },
                    versionGate = versionGate,
                )
            }
            composable(Routes.SHELL) {
                AppScaffold(
                    programContext = programContext,
                    appearanceStore = appearanceStore,
                    // Switch/Leave Program from the Program tab returns to the picker (Android nav idiom —
                    // the picker is the start destination, so a pop restores it, refreshed by local state).
                    onSwitchProgram = { nav.popBackStack(Routes.PROGRAM_PICKER, inclusive = false) },
                )
            }

            // Account settings reached from the picker's account sheet (no active program needed). Unlike the
            // in-program path these aren't hosted by AppScaffold's Scaffold, so they get no innerPadding — we
            // apply the status-bar top inset here so they anchor below the status bar exactly like the shell path.
            composable(Routes.PROGRAM_PROFILE) {
                SettingsInset { MyProfileScreen(programContext = programContext, onBack = { nav.popBackStack() }) }
            }
            composable(Routes.PROGRAM_PASSWORD) {
                SettingsInset { ChangePasswordScreen(programContext = programContext, onBack = { nav.popBackStack() }) }
            }
            composable(Routes.PROGRAM_APPEARANCE) {
                SettingsInset { AppearanceScreen(appearanceStore = appearanceStore, onBack = { nav.popBackStack() }) }
            }
            composable(Routes.PROGRAM_NOTIFICATIONS) {
                SettingsInset { NotificationsScreen(onBack = { nav.popBackStack() }) }
            }
            composable(Routes.HEALTH_CONNECT) {
                SettingsInset { HealthConnectSettingsScreen(programContext = programContext, onBack = { nav.popBackStack() }) }
            }

            // Home-screen widget deep-link targets (Glance quick-add). Root-level (no active program); the
            // custom back / system back / success dwell all exit to My Programs (iOS widget-form parity).
            composable(Routes.WIDGET_LOG_WORKOUT) {
                SettingsInset { QuickAddWorkoutWidgetScreen(programContext = programContext, onExit = { exitToMyPrograms() }) }
            }
            composable(Routes.WIDGET_LOG_HEALTH) {
                SettingsInset { QuickAddHealthWidgetScreen(programContext = programContext, onExit = { exitToMyPrograms() }) }
            }
        }
        OfflineBanner(rootBanner)
    }
}

/**
 * Applies the status-bar top inset to the picker-level account-settings screens. In the in-program path
 * these screens sit inside AppScaffold's Scaffold, which supplies the same inset via innerPadding; here
 * there's no Scaffold, so this keeps both entry points visually identical (content below the status bar).
 */
@Composable
private fun SettingsInset(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().statusBarsPadding()) { content() }
}

/** Logged-out navigation graph: splash → login → create-account / forgot-password. */
@Composable
private fun AuthGraph(programContext: ProgramContext, online: Boolean) {
    val nav = rememberNavController()
    // A2: a forced sign-out lands on Login (not the splash) so its one-shot reason shows in Login's error slot.
    val signOutNotice by programContext.signOutNotice.collectAsStateWithLifecycle()
    LaunchedEffect(signOutNotice) {
        if (signOutNotice != null) nav.navigate(Routes.LOGIN) { launchSingleTop = true }
    }
    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(navController = nav, startDestination = Routes.SPLASH, modifier = Modifier.offlineReserve(!online)) {
            composable(Routes.SPLASH) {
                SplashScreen(onSignIn = { nav.navigate(Routes.LOGIN) })
            }
            composable(Routes.LOGIN) {
                LoginScreen(
                    programContext = programContext,
                    onCreateAccount = { nav.navigate(Routes.CREATE_ACCOUNT) },
                    onForgotPassword = { nav.navigate(Routes.FORGOT_PASSWORD) },
                )
            }
            composable(Routes.CREATE_ACCOUNT) {
                CreateAccountScreen(programContext = programContext, onSignIn = { nav.popBackStack() })
            }
            composable(Routes.FORGOT_PASSWORD) {
                ForgotPasswordScreen(programContext = programContext, onBackToLogin = { nav.popBackStack() })
            }
        }
        OfflineBanner(!online)
    }
}

private const val WIDGET_GATE_TIMEOUT_MS = 3_000L

/** frontend-kit §6 banner block height (12 + 52 + 12 dp) — the content reserve while the offline banner shows (A6). */
internal val OFFLINE_BANNER_RESERVE: Dp = 76.dp

/** Lifts the content above the system nav bar + the banner while [active], so nothing sits under the banner. */
private fun Modifier.offlineReserve(active: Boolean): Modifier =
    if (active) navigationBarsPadding().padding(bottom = OFFLINE_BANNER_RESERVE) else this

/** The app-wide offline banner (A6) for screens without their own bottom chrome. */
@Composable
private fun BoxScope.OfflineBanner(visible: Boolean) {
    if (visible) FloatingBanner(FloatingBannerVariant.Offline, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
}
