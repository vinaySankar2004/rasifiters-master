-- 004_seed_healthkit_workout_types.sql
-- Seed the global workout library with the Apple Health (HealthKit) workout types so that
-- HealthKit auto-sync (iOS) can map every HKWorkoutActivityType onto a real library-backed
-- workout instead of scattering per-program *custom* rows (see specs/features/apple-health).
--
-- Reconciliation policy (user decisions D1/D2/D5):
--   * ADDITIVE ONLY — we do NOT rename existing library rows and do NOT touch
--     program_workouts / workout_logs. This migration only INSERTs the Apple types the library
--     lacks, using Apple's standard Title-Case display names.
--   * The iOS map (HealthKitWorkoutTypeMap) REUSES these existing rows for close equivalents,
--     so their Apple-canonical names are intentionally NOT inserted here (to avoid near-duplicates):
--        boxing→Boxing, cycling→Cycling, rowing→Rowing, running→Running, swimming→Swim,
--        highIntensityIntervalTraining→"HIIT Intervals", yoga→"Yoga Flow", pilates→"Pilates Core",
--        coreTraining→"Core & Abs", functionalStrengthTraining→"Functional Training",
--        cardioDance→"Dance Cardio", mixedCardio→"Cardio Endurance", stairClimbing→"Stair Climber",
--        flexibility→Stretching, preparationAndRecovery→Mobility, cooldown→Mobility.
--   * Every remaining non-deprecated HKWorkoutActivityType gets a new row below, plus the
--     "Other Workout" fallback used by the map's default case.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING relies on the workouts_library_name_key UNIQUE
-- constraint (apps/backend/sql/001_schema.sql). Safe to re-run.
--
-- Who runs this: the USER, not Claude (CLAUDE.md Database Write Policy).

INSERT INTO public.workouts_library (name) VALUES
    ('American Football'),
    ('Archery'),
    ('Australian Football'),
    ('Badminton'),
    ('Barre'),
    ('Baseball'),
    ('Basketball'),
    ('Bowling'),
    ('Climbing'),
    ('Cricket'),
    ('Cross Country Skiing'),
    ('Cross Training'),
    ('Curling'),
    ('Disc Sports'),
    ('Downhill Skiing'),
    ('Elliptical'),
    ('Equestrian Sports'),
    ('Fencing'),
    ('Fishing'),
    ('Fitness Gaming'),
    ('Golf'),
    ('Gymnastics'),
    ('Hand Cycling'),
    ('Handball'),
    ('Hiking'),
    ('Hockey'),
    ('Hunting'),
    ('Jump Rope'),
    ('Kickboxing'),
    ('Lacrosse'),
    ('Martial Arts'),
    ('Mind and Body'),
    ('Paddle Sports'),
    ('Pickleball'),
    ('Play'),
    ('Racquetball'),
    ('Rugby'),
    ('Sailing'),
    ('Skating Sports'),
    ('Snow Sports'),
    ('Snowboarding'),
    ('Soccer'),
    ('Social Dance'),
    ('Softball'),
    ('Squash'),
    ('Stairs'),
    ('Step Training'),
    ('Surfing Sports'),
    ('Swim Bike Run'),
    ('Table Tennis'),
    ('Tai Chi'),
    ('Tennis'),
    ('Track and Field'),
    ('Traditional Strength Training'),
    ('Transition'),
    ('Underwater Diving'),
    ('Volleyball'),
    ('Walking'),
    ('Water Fitness'),
    ('Water Polo'),
    ('Water Sports'),
    ('Wheelchair Run Pace'),
    ('Wheelchair Walk Pace'),
    ('Wrestling'),
    ('Other Workout')
ON CONFLICT (name) DO NOTHING;
