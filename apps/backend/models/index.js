const Member = require('./Member');
const MemberEmail = require('./MemberEmail');
const Workout = require('./Workout');
const WorkoutLog = require('./WorkoutLog');
const ProgramWorkout = require('./ProgramWorkout');
const Program = require('./Program');
const ProgramMembership = require('./ProgramMembership');
const ProgramInvite = require('./ProgramInvite');
const ProgramInviteBlock = require('./ProgramInviteBlock');
const DailyHealthLog = require('./DailyHealthLog');
const Notification = require('./Notification');
const NotificationRecipient = require('./NotificationRecipient');
const MemberPushToken = require('./MemberPushToken');

// Member-WorkoutLog association
Member.hasMany(WorkoutLog, { foreignKey: 'member_id' });
WorkoutLog.belongsTo(Member, { foreignKey: 'member_id' });

// Workout library - ProgramWorkout association
Workout.hasMany(ProgramWorkout, { foreignKey: 'library_workout_id' });
ProgramWorkout.belongsTo(Workout, { foreignKey: 'library_workout_id' });

// ProgramWorkout - WorkoutLog association
ProgramWorkout.hasMany(WorkoutLog, { foreignKey: 'program_workout_id' });
WorkoutLog.belongsTo(ProgramWorkout, { foreignKey: 'program_workout_id' });

// Program-Member association via ProgramMembership
Program.belongsToMany(Member, { through: ProgramMembership, foreignKey: 'program_id', otherKey: 'member_id' });
Member.belongsToMany(Program, { through: ProgramMembership, foreignKey: 'member_id', otherKey: 'program_id' });
ProgramMembership.belongsTo(Program, { foreignKey: 'program_id' });
ProgramMembership.belongsTo(Member, { foreignKey: 'member_id' });

// Program - ProgramWorkout association
Program.hasMany(ProgramWorkout, { foreignKey: 'program_id' });
ProgramWorkout.belongsTo(Program, { foreignKey: 'program_id' });

// Program - WorkoutLog association
Program.hasMany(WorkoutLog, { foreignKey: 'program_id' });
WorkoutLog.belongsTo(Program, { foreignKey: 'program_id' });

// DailyHealthLog associations
Member.hasMany(DailyHealthLog, { foreignKey: 'member_id' });
DailyHealthLog.belongsTo(Member, { foreignKey: 'member_id' });
Program.hasMany(DailyHealthLog, { foreignKey: 'program_id' });
DailyHealthLog.belongsTo(Program, { foreignKey: 'program_id' });

// ProgramMembership -> WorkoutLog/DailyHealthLog (for active member filters)
ProgramMembership.hasMany(WorkoutLog, { foreignKey: 'member_id', sourceKey: 'member_id', constraints: false });
WorkoutLog.belongsTo(ProgramMembership, { foreignKey: 'member_id', targetKey: 'member_id', constraints: false });
ProgramMembership.hasMany(DailyHealthLog, { foreignKey: 'member_id', sourceKey: 'member_id', constraints: false });
DailyHealthLog.belongsTo(ProgramMembership, { foreignKey: 'member_id', targetKey: 'member_id', constraints: false });

// Member emails
Member.hasMany(MemberEmail, { foreignKey: 'member_id' });
MemberEmail.belongsTo(Member, { foreignKey: 'member_id' });

// Program invites associations
Program.hasMany(ProgramInvite, { foreignKey: 'program_id' });
ProgramInvite.belongsTo(Program, { foreignKey: 'program_id' });
Member.hasMany(ProgramInvite, { foreignKey: 'invited_by', as: 'SentInvites' });
ProgramInvite.belongsTo(Member, { foreignKey: 'invited_by', as: 'InvitedByMember' });

// Program invite blocks associations
Program.hasMany(ProgramInviteBlock, { foreignKey: 'program_id' });
ProgramInviteBlock.belongsTo(Program, { foreignKey: 'program_id' });
Member.hasMany(ProgramInviteBlock, { foreignKey: 'member_id' });
ProgramInviteBlock.belongsTo(Member, { foreignKey: 'member_id' });

// Notifications associations
Notification.hasMany(NotificationRecipient, { foreignKey: 'notification_id' });
NotificationRecipient.belongsTo(Notification, { foreignKey: 'notification_id' });
Member.hasMany(NotificationRecipient, { foreignKey: 'member_id' });
NotificationRecipient.belongsTo(Member, { foreignKey: 'member_id' });
Program.hasMany(Notification, { foreignKey: 'program_id' });
Notification.belongsTo(Program, { foreignKey: 'program_id' });
Member.hasMany(Notification, { foreignKey: 'actor_member_id' });
Notification.belongsTo(Member, { foreignKey: 'actor_member_id', as: 'ActorMember' });

Member.hasMany(MemberPushToken, { foreignKey: 'member_id' });
MemberPushToken.belongsTo(Member, { foreignKey: 'member_id' });

module.exports = {
    Member,
    Workout,
    WorkoutLog,
    Program,
    ProgramMembership,
    ProgramWorkout,
    ProgramInvite,
    ProgramInviteBlock,
    DailyHealthLog,
    MemberEmail,
    Notification,
    NotificationRecipient,
    MemberPushToken
};
