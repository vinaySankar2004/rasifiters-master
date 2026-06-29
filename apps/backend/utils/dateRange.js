const toISO = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const getPeriodRange = (period) => {
    const today = new Date();
    const end = toISO(today);

    switch (period) {
        case "week": {
            const startDate = addDays(today, -6);
            const prevEndDate = addDays(startDate, -1);
            const prevStartDate = addDays(prevEndDate, -6);
            return {
                label: "week",
                current: { start: toISO(startDate), end },
                previous: { start: toISO(prevStartDate), end: toISO(prevEndDate) }
            };
        }
        case "month": {
            const startDate = addDays(today, -29);
            const prevEndDate = addDays(startDate, -1);
            const prevStartDate = addDays(prevEndDate, -29);
            return {
                label: "month",
                current: { start: toISO(startDate), end },
                previous: { start: toISO(prevStartDate), end: toISO(prevEndDate) }
            };
        }
        case "year": {
            const startDate = addDays(today, -364);
            const prevEndDate = addDays(startDate, -1);
            const prevStartDate = addDays(prevEndDate, -364);
            return {
                label: "year",
                current: { start: toISO(startDate), end },
                previous: { start: toISO(prevStartDate), end: toISO(prevEndDate) }
            };
        }
        case "day":
        default: {
            const yesterday = addDays(today, -1);
            return {
                label: "day",
                current: { start: end, end },
                previous: { start: toISO(yesterday), end: toISO(yesterday) }
            };
        }
    }
};

module.exports = {
    toISO,
    addDays,
    getPeriodRange
};
