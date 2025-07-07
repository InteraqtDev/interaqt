import { Attributive } from 'interaqt';

// Basic role permissions - no database queries
export const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'admin';
  }
});

export const DormLeaderRole = Attributive.create({
  name: 'DormLeaderRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'dormLeader';
  }
});

export const StudentRole = Attributive.create({
  name: 'StudentRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'student';
  }
});