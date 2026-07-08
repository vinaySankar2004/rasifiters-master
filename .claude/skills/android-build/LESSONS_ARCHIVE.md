# android-build — Lessons Archive

Full run-by-run history for the `android-build` skill (not auto-loaded). Newest first. Promote durable
patterns into `SKILL.md` → "Converged lessons"; keep this as the detailed log.

---

## Run 1 — 2026-07-08 — Phase A foundation, first green build

**Context:** Standing up `apps/android` from scratch (Phase A of the Android port plan). Goal: a compiling
foundation (Gradle project, DI, state hub, session, networking, theme, bottom-nav scaffold + stubs).

**Toolchain discovered already present:** Android Studio, SDK (platform android-36, build-tools 36.1.0 +
37.0.0, adb, emulator binary), Temurin JDK 21. **Missing:** any system image / AVD (user creates for the
run step), and `cmdline-tools` (not needed — used Android Studio's SDK). No global `gradle` → brew-installed
`gradle` (resolved to 9.6.1) ONCE to run `gradle wrapper --gradle-version 8.11.1 --distribution-type bin`,
which generated the committed wrapper. Thereafter only `./gradlew` is used.

**Version set chosen (builds clean):** AGP 8.9.1, Gradle 8.11.1, Kotlin 2.0.21, Compose BOM 2024.12.01,
Retrofit 2.11.0 + `retrofit2-kotlinx-serialization-converter` 1.0.0, OkHttp 4.12.0 (+ okhttp-sse,
logging), kotlinx-serialization-json 1.7.3, security-crypto 1.1.0-alpha06, datastore-preferences 1.1.1,
navigation-compose 2.8.5, lifecycle 2.8.7. compileSdk/targetSdk 36, minSdk 26, JDK 17 bytecode.

**Errors hit + fixes:**
1. `compileDebugKotlin FAILED — Variable 'Color_White' must be initialized` (×4). Cause: top-level `val`
   color schemes referenced a `private val Color_White` declared *below* them in Theme.kt; top-level init
   order is source order. Fix: declared `private val White` above the schemes (and inlined via
   `Color(0xFFFFFFFF)`). → rebuilt green.
2. (caught pre-build) `collectAsStateWithLifecycle` unresolved — added
   `androidx.lifecycle:lifecycle-runtime-compose` to the catalog + app deps.

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** (cold ~92s incl. distribution + dep
download; incremental ~7s). Debug APK produced. Handed off to user for AVD creation + visual run.

**Benign noise (ignored):** `kotlinOptions` deprecation warning; `stripDebugDebugSymbols` "Unable to strip
libandroidx.graphics.path.so / libdatastore_shared_counter.so — packaging as-is".

## Run 2 — 2026-07-08 — Phase B auth path (Splash/Login/CreateAccount/ForgotPassword)

**Context:** Ported the logged-out auth path into `apps/android` (5 new Compose files: `ui/auth/{AuthComponents,
SplashScreen,LoginScreen,CreateAccountScreen,ForgotPasswordScreen}.kt` + `core/AppLinks.kt`), wired the real
screens into `ui/RootScreen.kt`'s `AuthGraph`, deleted the 4 auth stubs, copied the iOS `brandIcon(.dark).png`
into `res/drawable/brand_icon(_dark).png`. State-hub actions (`login`/`register`/`forgotPassword`) already
existed from Phase A. Login uses `POST /auth/login/app`; create-account does register→auto-login (iOS F2 parity).

**Errors hit + fixes (one rebuild):**
1. **Trailing-lambda bound to `modifier`, not the callback.** `AppPasswordField(label,value,onChange,visible,
   onToggleVisible,modifier)` — a trailing `{ … }` at the call site attaches to the LAST param (`modifier:
   Modifier`), yielding "No value passed for parameter 'onToggleVisible'" + "Argument type mismatch … Modifier
   expected". Fix: pass `onToggleVisible = { … }` **named** (don't rely on trailing-lambda when a trailing
   `modifier` follows the function-type param). Durable trap.
2. **`ExposedDropdownMenu` unresolved at import** in Compose BOM 2024.12.01 (`import androidx.compose.material3.
   ExposedDropdownMenu` = "Unresolved reference"). Sidestepped entirely: a plain `Box { OutlinedTextField(
   readOnly) + DropdownMenu }` with an `IconButton` trailing icon toggling `expanded` — no `ExposedDropdownMenuBox`,
   no experimental opt-in. Simpler + version-robust for a read-only picker.
3. **Wrong `weight` import shadowed the ColumnScope one.** `import androidx.compose.foundation.layout.weight`
   pulls an internal `RowColumnParentData?.weight` → "Cannot access … it is internal". `Modifier.weight(Float)`
   is a `ColumnScope`/`RowScope` receiver extension — available implicitly inside the `Column {}` lambda with
   NO import. Remove the bad import.

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** (~2s incremental). 4 auth stubs gone; the
scaffold-removal tracker advances (Summary/Members/Lifestyle/Program stubs remain for Phases D–G). Handed off
to user for the Pixel 8 emulator visual run.
