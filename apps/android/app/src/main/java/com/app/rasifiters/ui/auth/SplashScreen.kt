package com.app.rasifiters.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

private const val HEADLINE = "Hi, welcome to RaSi Fiters"
private const val SUBHEADLINE =
    "Track your fitness journey by logging workouts and monitoring your progress!"
private const val CHAR_DELAY_MS = 55L

/**
 * Public welcome screen (iOS `SplashView` / web `splash`). Types the headline then the subheadline,
 * shows the brand mark, and reveals a single "Sign in" CTA. Tapping anywhere fast-forwards the intro
 * (D-SKIP). No API call — the root gate handles the authed case.
 */
@Composable
fun SplashScreen(onSignIn: () -> Unit) {
    var headline by remember { mutableStateOf("") }
    var subheadline by remember { mutableStateOf("") }
    var headlineComplete by remember { mutableStateOf(false) }
    var ctaVisible by remember { mutableStateOf(false) }
    var skipped by remember { mutableStateOf(false) }

    // Typewriter sequence — re-reads `skipped` each tick so a tap short-circuits to the final state.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        for (c in HEADLINE) {
            if (skipped) break
            delay(CHAR_DELAY_MS)
            if (skipped) break
            headline += c
        }
        if (!skipped) {
            headlineComplete = true
            delay(400)
            for (c in SUBHEADLINE) {
                if (skipped) break
                delay(CHAR_DELAY_MS)
                if (skipped) break
                subheadline += c
            }
            if (!skipped) {
                delay(300)
                ctaVisible = true
            }
        }
    }

    AuthBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures {
                        if (!ctaVisible) {
                            skipped = true
                            headline = HEADLINE
                            subheadline = SUBHEADLINE
                            headlineComplete = true
                            ctaVisible = true
                        }
                    }
                }
                .padding(horizontal = 20.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.4f))

            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = headline,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (headlineComplete) {
                        MaterialTheme.colorScheme.onBackground.copy(alpha = 0.55f)
                    } else {
                        MaterialTheme.colorScheme.onBackground
                    },
                )
                Text(
                    text = subheadline,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }

            Spacer(Modifier.weight(1f))

            BrandMark(sizeDp = 120)

            Spacer(Modifier.weight(1f))

            AnimatedVisibility(visible = ctaVisible, enter = slideInVertically { it } + fadeIn()) {
                PillButton(label = "Sign in", onClick = onSignIn)
            }

            Spacer(Modifier.weight(0.3f))
        }
    }
}
