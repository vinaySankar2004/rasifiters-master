// Program service — the /api/programs business logic.
// See specs/features/programs/SPEC.md. FAITHFUL to legacy services/programService.js EXCEPT:
//   • D-C2 — createProgram DROPS the vestigial `description` field (legacy destructured + persisted +
//     returned it, but no client sends it, update can't change it, and list never returns it). The
//     programs.description column is kept in schema (R5); this path just no longer writes it.
//   • D-C1 — the program.updated / program.deleted notification emit is DEFERRED to the `notifications`
//     feature (it pulls in SSE streams + APNs push). The CRUD is fully functional; only the member-alert
//     side-effect is a guarded no-op (emitProgramNotification) until notifications is ported.
// getPrograms keeps its two raw sequelize.query branches verbatim (D-S2).
const { Program, ProgramMembership } = require("../models");
const { sequelize } = require("../config/database");
const { AppError } = require("../utils/response");

// DEFERRED (D-C1): when the `notifications` feature is ported, replace this with the real
// getActiveProgramMemberIds + createNotification emit (legacy utils/notifications.js). Until then it is a
// no-op so program CRUD works without dragging in SSE streams + APNs push. Faithful behavior = emit.
async function emitProgramNotification(/* { type, programId, actorMemberId, title, body } */) {
    // TODO(notifications): wire program.updated / program.deleted emit to active members.
    return null;
}

async function getPrograms(requester) {
    const isGlobalAdmin = requester?.global_role === "global_admin";
    const requesterId = requester?.id;

    if (isGlobalAdmin) {
        const [results] = await sequelize.query(`
            SELECT
                p.id, p.name, p.status, p.start_date, p.end_date,
                p.is_deleted, p.created_at, p.updated_at, p.admin_only_data_entry,
                COALESCE(COUNT(DISTINCT CASE WHEN pm.status = 'active' THEN pm.member_id END), 0)::int AS total_members,
                COALESCE(COUNT(DISTINCT CASE WHEN pm.status = 'active' THEN pm.member_id END), 0)::int AS active_members,
                pm_user.role AS my_role,
                pm_user.status AS my_status,
                CASE
                    WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
                         AND p.end_date > p.start_date
                    THEN LEAST(100, GREATEST(0,
                        ((CURRENT_DATE - p.start_date)::numeric /
                         NULLIF((p.end_date - p.start_date)::numeric, 0)) * 100
                    ))::int
                    ELSE 0
                END AS progress_percent
            FROM programs p
            LEFT JOIN program_memberships pm ON p.id = pm.program_id
            LEFT JOIN program_memberships pm_user ON p.id = pm_user.program_id AND pm_user.member_id = :userId
            WHERE p.is_deleted = false
            GROUP BY p.id, pm_user.role, pm_user.status
            ORDER BY p.start_date ASC
        `, { replacements: { userId: requesterId } });
        return results;
    }

    const [results] = await sequelize.query(`
        SELECT
            p.id, p.name, p.status, p.start_date, p.end_date,
            p.is_deleted, p.created_at, p.updated_at, p.admin_only_data_entry,
            COALESCE(COUNT(DISTINCT pm_all.member_id), 0)::int AS total_members,
            COALESCE(COUNT(DISTINCT pm_all.member_id), 0)::int AS active_members,
            pm_user.role AS my_role,
            pm_user.status AS my_status,
            CASE
                WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
                     AND p.end_date > p.start_date
                THEN LEAST(100, GREATEST(0,
                    ((CURRENT_DATE - p.start_date)::numeric /
                     NULLIF((p.end_date - p.start_date)::numeric, 0)) * 100
                ))::int
                ELSE 0
            END AS progress_percent
        FROM programs p
        INNER JOIN program_memberships pm_user
            ON p.id = pm_user.program_id
            AND pm_user.member_id = :userId
            AND pm_user.status IN ('active', 'invited', 'requested')
        LEFT JOIN program_memberships pm_all
            ON p.id = pm_all.program_id
            AND pm_all.status = 'active'
        WHERE p.is_deleted = false
        GROUP BY p.id, pm_user.role, pm_user.status
        ORDER BY p.start_date ASC
    `, { replacements: { userId: requesterId } });
    return results;
}

async function createProgram({ name, status, start_date, end_date }, requester) {
    if (!name || typeof name !== "string" || name.trim() === "") {
        throw new AppError(400, "Program name is required.");
    }

    const validStatuses = ["planned", "active", "completed"];
    const programStatus = status && validStatuses.includes(status) ? status : "planned";

    const transaction = await sequelize.transaction();
    try {
        const program = await Program.create({
            name: name.trim(),
            status: programStatus,
            start_date: start_date || null,
            end_date: end_date || null,
            created_by: requester?.id,
            is_deleted: false
        }, { transaction });

        await ProgramMembership.create({
            program_id: program.id,
            member_id: requester?.id,
            role: "admin",
            status: "active",
            joined_at: new Date().toISOString().slice(0, 10)
        }, { transaction });

        await transaction.commit();

        return {
            id: program.id,
            name: program.name,
            status: program.status,
            start_date: program.start_date,
            end_date: program.end_date,
            message: "Program created successfully."
        };
    } catch (err) {
        await transaction.rollback();
        throw new AppError(500, "Failed to create program.");
    }
}

async function updateProgram(programId, { name, status, start_date, end_date, admin_only_data_entry }, requester) {
    const program = await Program.findOne({ where: { id: programId, is_deleted: false } });
    if (!program) throw new AppError(404, "Program not found.");

    if (requester?.global_role !== "global_admin") {
        const pm = await ProgramMembership.findOne({
            where: { program_id: programId, member_id: requester?.id, role: "admin", status: "active" }
        });
        if (!pm) throw new AppError(403, "Admin privileges required for this program.");
    }

    const previousSnapshot = {
        name: program.name,
        status: program.status,
        start_date: program.start_date ? String(program.start_date) : null,
        end_date: program.end_date ? String(program.end_date) : null,
        admin_only_data_entry: String(program.admin_only_data_entry)
    };

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (end_date !== undefined) updateData.end_date = end_date;
    if (admin_only_data_entry !== undefined) {
        updateData.admin_only_data_entry = admin_only_data_entry === true || admin_only_data_entry === "true";
    }
    updateData.updated_at = new Date();

    await program.update(updateData);

    const detailFields = ["name", "status", "start_date", "end_date", "admin_only_data_entry"];
    const hasDetailChange = detailFields.some((field) => {
        if (updateData[field] === undefined) return false;
        const nextValue = updateData[field] === null ? null : String(updateData[field]);
        return nextValue !== previousSnapshot[field];
    });

    if (hasDetailChange) {
        // DEFERRED (D-C1): emit program.updated to active members when notifications is ported.
        await emitProgramNotification({
            type: "program.updated",
            programId,
            actorMemberId: requester?.id || null,
            title: "Program updated",
            body: `${program.name} details were updated.`
        });
    }

    return {
        id: program.id,
        name: program.name,
        status: program.status,
        start_date: program.start_date,
        end_date: program.end_date,
        admin_only_data_entry: program.admin_only_data_entry,
        message: "Program updated successfully."
    };
}

async function deleteProgram(programId, requester) {
    if (requester?.global_role !== "global_admin") {
        const pm = await ProgramMembership.findOne({
            where: { program_id: programId, member_id: requester?.id, role: "admin", status: "active" }
        });
        if (!pm) throw new AppError(403, "Admin privileges required for this program.");
    }

    const program = await Program.findOne({ where: { id: programId, is_deleted: false } });
    if (!program) throw new AppError(404, "Program not found.");

    await program.update({ is_deleted: true, updated_at: new Date() });

    // DEFERRED (D-C1): emit program.deleted to active members when notifications is ported.
    await emitProgramNotification({
        type: "program.deleted",
        programId,
        actorMemberId: requester?.id || null,
        title: "Program deleted",
        body: `${program.name} was deleted.`
    });

    return { id: program.id, message: "Program deleted successfully." };
}

module.exports = {
    getPrograms,
    createProgram,
    updateProgram,
    deleteProgram
};
