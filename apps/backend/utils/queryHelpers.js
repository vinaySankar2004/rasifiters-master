const { ProgramMembership } = require("../models");

const activeMembershipInclude = (programId) => ({
    model: ProgramMembership,
    attributes: [],
    required: true,
    where: {
        program_id: programId,
        status: "active"
    }
});

const percentChange = (current, previous) => {
    if (!previous || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
};

// Analytics D-C12 — month-to-date vs the SAME days of last month, on the UTC calendar (the backend's analytics date
// rule; these totals are program-wide — one value for every viewer). current = this whole UTC month, 1st → last day:
// every log dated this month counts, incl. one an east-of-UTC member logged on their local today. previous = last
// month's 1st → today's UTC day-of-month, capped at last month's length (Mar 31 → Feb 1–28). Both ends inclusive
// (the callers use [Op.between]).
const buildMTDDateRanges = (now = new Date()) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const isoDay = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
    const prevMonthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();

    return {
        current: { start: isoDay(year, month, 1), end: isoDay(year, month + 1, 0) },
        previous: {
            start: isoDay(year, month - 1, 1),
            end: isoDay(year, month - 1, Math.min(now.getUTCDate(), prevMonthLength))
        }
    };
};

module.exports = {
    activeMembershipInclude,
    percentChange,
    buildMTDDateRanges
};
