package com.app.rasifiters.ui.components

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.ui.auth.BrandMark
import com.app.rasifiters.ui.auth.PillButton

/** Blocking "Update required" (app-config §3; kit copy updateRequired / update). Not dismissable; back closes the app.
 *  "Update" opens the Play Store listing with a plain intent (A7). */
@Composable
fun UpdateRequiredScreen(onUpdate: () -> Unit) {
    val activity = LocalContext.current as? Activity
    BackHandler { activity?.finish() }
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().systemBarsPadding().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        ) {
            BrandMark(sizeDp = 72)
            Text(
                KitCopy.messageFor(AppErrorKind.UPDATE_REQUIRED),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            PillButton(label = KitCopy.UPDATE, onClick = onUpdate, modifier = Modifier.widthIn(max = 260.dp))
        }
    }
}
