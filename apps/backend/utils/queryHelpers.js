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

const buildMTDDateRanges = () => {
    const today = new Date();
    const currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    return {
        current: {
            start: currentStart.toISOString().slice(0, 10),
            end: nextMonthStart.toISOString().slice(0, 10)
        },
        previous: {
            start: prevMonthStart.toISOString().slice(0, 10),
            end: prevMonthEnd.toISOString().slice(0, 10)
        }
    };
};

module.exports = {
    activeMembershipInclude,
    percentChange,
    buildMTDDateRanges
};
