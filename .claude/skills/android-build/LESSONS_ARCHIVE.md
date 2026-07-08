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
