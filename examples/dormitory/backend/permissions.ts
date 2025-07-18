import { Condition, BoolExp, Conditions, MatchExp } from 'interaqt';
import type { Controller } from 'interaqt';

// Role-based conditions
export const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'admin';
  }
});

export const LeaderRole = Condition.create({
  name: 'LeaderRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'leader';
  }
});

export const ResidentRole = Condition.create({
  name: 'ResidentRole',
  content: async function(this: Controller, event) {
    return event.user?.role === 'resident';
  }
});

// Combined role permissions
export const AdminOrLeaderRole = Condition.create({
  name: 'AdminOrLeaderRole',
  content: async function(this: Controller, event) {
    const role = event.user?.role;
    return role === 'admin' || role === 'leader';
  }
});

// User authentication check
export const AuthenticatedUser = Condition.create({
  name: 'AuthenticatedUser',
  content: async function(this: Controller, event) {
    return event.user && event.user.id && event.user.role;
  }
});

// Active user check
export const ActiveUser = Condition.create({
  name: 'ActiveUser',
  content: async function(this: Controller, event) {
    if (!event.user?.id) return false;
    
    const user = await this.system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
      undefined,
      ['isActive']
    );
    
    return user && user.isActive;
  }
});

// Dormitory-specific permissions
export const LeaderOfTargetUsersDormitory = Condition.create({
  name: 'LeaderOfTargetUsersDormitory',
  content: async function(this: Controller, event) {
    // Only applies to leaders
    if (event.user?.role !== 'leader') return false;
    
    const targetUserId = event.payload?.targetUserId;
    if (!targetUserId) return false;
    
    // Get target user's current assignment
    const assignment = await this.system.storage.findOne('Assignment',
      MatchExp.atom({ key: 'userId', value: ['=', targetUserId] })
        .and({ key: 'isActive', value: ['=', true] }),
      undefined,
      ['bedSpaceId']
    );
    
    if (!assignment) return false;
    
    // Get the dormitory from bed space
    const bedSpace = await this.system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'id', value: ['=', assignment.bedSpaceId] }),
      undefined,
      ['dormitoryId']
    );
    
    if (!bedSpace) return false;
    
    // Check if current user is leader of this dormitory
    const dormitory = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', bedSpace.dormitoryId] }),
      undefined,
      ['leaderId']
    );
    
    return dormitory && dormitory.leaderId === event.user.id;
  }
});

export const LeaderOfOwnDormitory = Condition.create({
  name: 'LeaderOfOwnDormitory',
  content: async function(this: Controller, event) {
    if (event.user?.role !== 'leader') return false;
    
    // Check if user is assigned as leader of any dormitory
    const dormitory = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'leaderId', value: ['=', event.user.id] }),
      undefined,
      ['id', 'isActive']
    );
    
    return dormitory && dormitory.isActive;
  }
});

// Payload validation conditions
export const ValidDormitoryCapacity = Condition.create({
  name: 'ValidDormitoryCapacity',
  content: async function(this: Controller, event) {
    const capacity = event.payload?.capacity;
    if (typeof capacity !== 'number') return false;
    
    return capacity >= 4 && capacity <= 6;
  }
});

export const ValidViolationType = Condition.create({
  name: 'ValidViolationType',
  content: async function(this: Controller, event) {
    const violationType = event.payload?.type;
    const validTypes = [
      'NOISE_VIOLATION',
      'CLEANLINESS_ISSUE', 
      'DAMAGE_TO_PROPERTY',
      'UNAUTHORIZED_GUESTS',
      'CURFEW_VIOLATION'
    ];
    
    return validTypes.includes(violationType);
  }
});

export const ValidKickoutDecision = Condition.create({
  name: 'ValidKickoutDecision',
  content: async function(this: Controller, event) {
    const decision = event.payload?.decision;
    return decision === 'approved' || decision === 'rejected';
  }
});

// Data state conditions
export const UserExists = Condition.create({
  name: 'UserExists',
  content: async function(this: Controller, event) {
    const userId = event.payload?.userId || event.payload?.targetUserId;
    if (!userId) return false;
    
    const user = await this.system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'isActive']
    );
    
    return user && user.isActive;
  }
});

export const DormitoryExists = Condition.create({
  name: 'DormitoryExists',
  content: async function(this: Controller, event) {
    const dormitoryId = event.payload?.dormitoryId;
    if (!dormitoryId) return false;
    
    const dormitory = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['id', 'isActive']
    );
    
    return dormitory && dormitory.isActive;
  }
});

export const BedSpaceExists = Condition.create({
  name: 'BedSpaceExists',
  content: async function(this: Controller, event) {
    const bedSpaceId = event.payload?.bedSpaceId || event.payload?.newBedSpaceId;
    if (!bedSpaceId) return false;
    
    const bedSpace = await this.system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'id', value: ['=', bedSpaceId] }),
      undefined,
      ['id', 'isOccupied']
    );
    
    return !!bedSpace;
  }
});

export const BedSpaceAvailable = Condition.create({
  name: 'BedSpaceAvailable',
  content: async function(this: Controller, event) {
    const bedSpaceId = event.payload?.bedSpaceId || event.payload?.newBedSpaceId;
    if (!bedSpaceId) return false;
    
    const bedSpace = await this.system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'id', value: ['=', bedSpaceId] }),
      undefined,
      ['id', 'isOccupied']
    );
    
    return bedSpace && !bedSpace.isOccupied;
  }
});

export const UserNotAlreadyAssigned = Condition.create({
  name: 'UserNotAlreadyAssigned',
  content: async function(this: Controller, event) {
    const userId = event.payload?.userId;
    if (!userId) return false;
    
    const existingAssignment = await this.system.storage.findOne('Assignment',
      MatchExp.atom({ key: 'userId', value: ['=', userId] })
        .and({ key: 'isActive', value: ['=', true] }),
      undefined,
      ['id']
    );
    
    return !existingAssignment;
  }
});

export const KickoutRequestExists = Condition.create({
  name: 'KickoutRequestExists',
  content: async function(this: Controller, event) {
    const requestId = event.payload?.requestId;
    if (!requestId) return false;
    
    const request = await this.system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'id', value: ['=', requestId] }),
      undefined,
      ['id', 'status']
    );
    
    return request && request.status === 'pending';
  }
});

export const TargetUserInLeadersDormitory = Condition.create({
  name: 'TargetUserInLeadersDormitory',
  content: async function(this: Controller, event) {
    if (event.user?.role !== 'leader') return true; // Only applies to leaders
    
    return await LeaderOfTargetUsersDormitory.content.call(this, event);
  }
});

// Complex combined conditions for specific operations
export const CanReportViolation = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminOrLeaderRole))
    .and(BoolExp.atom(ValidViolationType))
    .and(BoolExp.atom(UserExists))
    .and(BoolExp.atom(TargetUserInLeadersDormitory))
});

export const CanSubmitKickoutRequest = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminOrLeaderRole))
    .and(BoolExp.atom(UserExists))
    .and(BoolExp.atom(TargetUserInLeadersDormitory))
});

export const CanAssignUserToBed = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminRole))
    .and(BoolExp.atom(UserExists))
    .and(BoolExp.atom(BedSpaceExists))
    .and(BoolExp.atom(BedSpaceAvailable))
    .and(BoolExp.atom(UserNotAlreadyAssigned))
});

export const CanCreateDormitory = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminRole))
    .and(BoolExp.atom(ValidDormitoryCapacity))
});

export const CanApproveKickoutRequest = Conditions.create({
  content: BoolExp.atom(AuthenticatedUser)
    .and(BoolExp.atom(ActiveUser))
    .and(BoolExp.atom(AdminRole))
    .and(BoolExp.atom(KickoutRequestExists))
    .and(BoolExp.atom(ValidKickoutDecision))
});