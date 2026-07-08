package com.app.rasifiters.ui.shell

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.ui.MainTab
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.StubScreen

/**
 * The per-program app shell: a bottom nav bar (Summary / Members / Lifestyle / Program) over an
 * inner NavHost. Mirrors the iOS AdminHomeView TabView and the web AppShell bottom tabs.
 * Tabs render admin/standard role variants once the real screens land (Phase D+).
 */
@Composable
fun AppScaffold(programContext: ProgramContext) {
    val nav = rememberNavController()
    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.hierarchy

    Scaffold(
        bottomBar = {
            NavigationBar {
                MainTab.entries.forEach { tab ->
                    val selected = currentRoute?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon(), contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = nav,
            startDestination = Routes.SUMMARY,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Routes.SUMMARY) { StubScreen("Summary") }
            composable(Routes.MEMBERS) { StubScreen("Members") }
            composable(Routes.LIFESTYLE) { StubScreen("Lifestyle") }
            composable(Routes.PROGRAM) { StubScreen("Program") }
        }
    }
}

private fun MainTab.icon(): ImageVector = when (this) {
    MainTab.SUMMARY -> Icons.Filled.BarChart
    MainTab.MEMBERS -> Icons.Filled.Group
    MainTab.LIFESTYLE -> Icons.Filled.FavoriteBorder
    MainTab.PROGRAM -> Icons.Filled.Settings
}
