package com.app.rasifiters.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.auth.CreateAccountScreen
import com.app.rasifiters.ui.auth.ForgotPasswordScreen
import com.app.rasifiters.ui.auth.LoginScreen
import com.app.rasifiters.ui.auth.SplashScreen
import com.app.rasifiters.ui.programs.ProgramPickerScreen
import com.app.rasifiters.ui.shell.AppScaffold

/**
 * Root auth gate — the analog of iOS AppRootView / web middleware+useAuthGuard.
 * Signed in (token present) → the per-program app shell; else → the auth (logged-out) graph.
 * A successful login/register flips `authToken`, so the root swaps to the shell (no explicit nav).
 */
@Composable
fun RootScreen(programContext: ProgramContext, appearanceStore: AppearanceStore) {
    val token by programContext.authToken.collectAsStateWithLifecycle()

    if (token == null) {
        AuthGraph(programContext)
    } else {
        SignedInGraph(programContext, appearanceStore)
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
    }
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
