// Workout service — the /api/workouts (global workout library) business logic.
// See specs/features/workouts/SPEC.md. FAITHFUL 1:1 to the LIBRARY half of legacy
// services/workoutService.js (the global-library functions only). The legacy file also held the
// program-scoped functions (getProgramWorkouts, toggle*/addCustomWorkout/editCustomWorkout/
// deleteCustomWorkout) — those belong to the separate `program-workouts` feature (SPEC §7 / D-C1) and
// port with it, so this file is split along that boundary. No migration delta: the Workout model +
// workouts_library schema are already ported; only DATABASE_URL changes.
const { Workout } = require("../models");
const { AppError } = require("../utils/response");

async function getAllWorkouts() {
    return Workout.findAll({ order: [["workout_name", "ASC"]] });
}

async function createWorkout(workout_name) {
    if (!workout_name) throw new AppError(400, "Workout name is required.");
    return Workout.create({ workout_name });
}

async function updateWorkout(currentName, newName) {
    const workout = await Workout.findOne({ where: { workout_name: currentName } });
    if (!workout) throw new AppError(404, "Workout not found.");
    await workout.update({ workout_name: newName });
    return { message: "Workout updated successfully." };
}

// FAITHFUL (SPEC §7 / D-S1 / F2): bare destroy, no in-use guard. The program_workouts.library_workout_id
// FK has no ON DELETE CASCADE, so deleting an in-use library workout throws an FK violation → generic 500.
// Kept as-is (no client calls DELETE); the friendly-400 guard is a flagged cleanup candidate.
async function deleteWorkout(workoutName) {
    const workout = await Workout.findOne({ where: { workout_name: workoutName } });
    if (!workout) throw new AppError(404, "Workout not found.");
    await workout.destroy();
    return { message: "Workout deleted successfully." };
}

module.exports = {
    getAllWorkouts,
    createWorkout,
    updateWorkout,
    deleteWorkout
};
