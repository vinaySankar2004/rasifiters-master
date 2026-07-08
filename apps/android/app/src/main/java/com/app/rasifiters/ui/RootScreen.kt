package com.app.rasifiters.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.shell.AppScaffold

/**
 * Root auth gate — the analog of iOS AppRootView / web middleware+useAuthGuard.
 * Signed in (token present) → the per-program app shell; else → the auth (logged-out) graph.
 */
@Composable
fun RootScreen(programContext: ProgramContext) {
    val token by programContext.authToken.collectAsStateWithLifecycle()

    if (token == null) {
        AuthGraph()
    } else {
        AppScaffold(programContext = programContext)
    }
}

/** Logged-out navigation graph. Screens are stubs until Phase B ports the real auth path. */
@Composable
private fun AuthGraph() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) { StubScreen("Splash") }
        composable(Routes.LOGIN) { StubScreen("Login") }
        composable(Routes.CREATE_ACCOUNT) { StubScreen("Create Account") }
        composable(Routes.FORGOT_PASSWORD) { StubScreen("Forgot Password") }
    }
}
