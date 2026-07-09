package com.app.rasifiters.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.components.NotificationModal
import kotlinx.coroutines.launch
import com.app.rasifiters.ui.auth.CreateAccountScreen
import com.app.rasifiters.ui.auth.ForgotPasswordScreen
import com.app.rasifiters.ui.auth.LoginScreen
import com.app.rasifiters.ui.auth.SplashScreen
import com.app.rasifiters.ui.program.AppearanceScreen
import com.app.rasifiters.ui.program.ChangePasswordScreen
import com.app.rasifiters.ui.program.MyProfileScreen
import com.app.rasifiters.ui.program.NotificationsScreen
import com.app.rasifiters.ui.programs.ProgramPickerScreen
import com.app.rasifiters.ui.shell.AppScaffold
import com.app.rasifiters.ui.health.HealthConnectSettingsScreen
import com.app.rasifiters.ui.health.HealthSyncConfirmationScreen

/**
 * Root auth gate — the analog of iOS AppRootView / web middleware+useAuthGuard.
 * Signed in (token present) → the per-program app shell; else → the auth (logged-out) graph.
 * A successful login/register flips `authToken`, so the root swaps to the shell (no explicit nav).
 */
@Composable
fun RootScreen(programContext: ProgramContext, appearanceStore: AppearanceStore) {
    val token by programContext.authToken.collectAsStateWithLifecycle()
    val notificationQueue by programContext.notificationQueue.collectAsStateWithLifecycle()
    val pendingHealthConfirmation by programContext.health.pendingConfirmation.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Android 13+ POST_NOTIFICATIONS runtime permission — token registration proceeds regardless of the
    // grant (the permission only gates DISPLAYING pushes; registration doesn't need it), so we ignore the result.
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* granted-or-not: nothing to do — FCM registration is independent of display permission */ }

    // Notification lifecycle (iOS AppRootView parity): open the SSE stream + backfill + register the FCM
    // token when signed in (and ask for POST_NOTIFICATIONS on 13+); tear the stream down on sign-out.
    LaunchedEffect(token) {
        if (token != null) {
            programContext.startNotificationStreamIfNeeded()
            programContext.registerPushTokenIfNeeded()
            programContext.health.onTrigger()   // Health Connect sync on launch / auth change (iOS parity)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            programContext.stopNotificationStream()
        }
    }

    // Restart the stream on app resume (the iOS `scenePhase == .active` restart) — recovers a socket that
    // dropped while backgrounded and re-runs the unacknowledged backfill.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, token) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && token != null) {
                programContext.startNotificationStreamIfNeeded()
                programContext.registerPushTokenIfNeeded()
                programContext.health.onTrigger()   // Health Connect sync on foreground return (iOS scenePhase parity)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box {
        if (token == null) {
            AuthGraph(programContext)
        } else {
            SignedInGraph(programContext, appearanceStore)
        }

        // The single-notification modal queue, shown above the whole app (iOS AppRootView ZStack overlay).
        notificationQueue.firstOrNull()?.let { notification ->
            NotificationModal(
                title = notification.title,
                message = notification.body,
                onAcknowledge = { scope.launch { programContext.acknowledgeNotification(notification) } },
            )
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
    }
}

/** Signed-in navigation graph: the program picker (landing) → the per-program tab shell. */
@Composable
private fun SignedInGraph(programContext: ProgramContext, appearanceStore: AppearanceStore) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.PROGRAM_PICKER) {
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
private fun AuthGraph(programContext: ProgramContext) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.SPLASH) {
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
}
