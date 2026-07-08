package com.app.rasifiters.ui.shell

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.MaterialTheme
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
import com.app.rasifiters.ui.summary.SummaryScreen

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
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                val itemColors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.primary,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                    unselectedTextColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                )
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
                        colors = itemColors,
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
            composable(Routes.SUMMARY) {
                SummaryScreen(programContext = programContext, onNavigate = { nav.navigate(it) })
            }
            composable(Routes.MEMBERS) { StubScreen("Members") }
            composable(Routes.LIFESTYLE) { StubScreen("Lifestyle") }
            composable(Routes.PROGRAM) { StubScreen("Program") }

            // Summary forward targets — stubbed this phase (iOS D-SCOPE landing-vs-details split).
            composable(Routes.SUMMARY_ACTIVITY) { StubScreen("Activity Timeline") }
            composable(Routes.SUMMARY_DISTRIBUTION) { StubScreen("Distribution by Day") }
            composable(Routes.SUMMARY_WORKOUT_TYPES) { StubScreen("Workout Types") }
            composable(Routes.SUMMARY_LOG_WORKOUT) { StubScreen("Add Workouts") }
            composable(Routes.SUMMARY_LOG_HEALTH) { StubScreen("Log Daily Health") }
        }
    }
}

// Icon parity with iOS: bar-chart · people · leaf · calendar.
private fun MainTab.icon(): ImageVector = when (this) {
    MainTab.SUMMARY -> Icons.Filled.BarChart
    MainTab.MEMBERS -> Icons.Filled.Group
    MainTab.LIFESTYLE -> Icons.Filled.Eco
    MainTab.PROGRAM -> Icons.Filled.CalendarMonth
}
