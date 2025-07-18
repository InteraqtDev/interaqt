import { Interaction, Action, Payload, PayloadItem } from 'interaqt';
import { User, Dormitory, BedSpace, Assignment, Violation, KickoutRequest } from './entities';
import {
  AdminRole,
  LeaderRole,
  AdminOrLeaderRole,
  AuthenticatedUser,
  ActiveUser,
  CanCreateDormitory,
  CanAssignUserToBed,
  CanReportViolation,
  CanSubmitKickoutRequest,
  CanApproveKickoutRequest,
  ValidDormitoryCapacity,
  UserExists,
  DormitoryExists,
  BedSpaceExists
} from './permissions';

// Dormitory Management Interactions
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  }),
  conditions: CanCreateDormitory
});

export const CreateBedSpace = Interaction.create({
  name: 'CreateBedSpace',
  action: Action.create({ name: 'createBedSpace' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  }),
  conditions: AdminRole
});

export const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory', 
  action: Action.create({ name: 'updateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' })
    ]
  }),
  conditions: AdminRole
});

export const AssignDormLeader = Interaction.create({
  name: 'AssignDormLeader',
  action: Action.create({ name: 'assignDormLeader' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'leaderId', required: true })
    ]
  }),
  conditions: AdminRole
});

// User Assignment Interactions
export const AssignUserToBed = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'assignUserToBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'bedSpaceId', required: true })
    ]
  }),
  conditions: CanAssignUserToBed
});

export const TransferUser = Interaction.create({
  name: 'TransferUser',
  action: Action.create({ name: 'transferUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'newBedSpaceId', required: true })
    ]
  }),
  conditions: AdminRole
});

export const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'removeUserFromDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  }),
  conditions: AdminRole
});

// Violation Management Interactions
export const ReportViolation = Interaction.create({
  name: 'ReportViolation',
  action: Action.create({ name: 'reportViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'description', required: true })
    ]
  }),
  conditions: CanReportViolation
});

export const UpdateViolation = Interaction.create({
  name: 'UpdateViolation',
  action: Action.create({ name: 'updateViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'violationId', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'scoreDeduction' })
    ]
  }),
  conditions: AdminRole
});

export const DeleteViolation = Interaction.create({
  name: 'DeleteViolation',
  action: Action.create({ name: 'deleteViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'violationId', required: true })
    ]
  }),
  conditions: AdminRole
});

// Kickout Request Interactions
export const SubmitKickoutRequest = Interaction.create({
  name: 'SubmitKickoutRequest',
  action: Action.create({ name: 'submitKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  }),
  conditions: CanSubmitKickoutRequest
});

export const ApproveKickoutRequest = Interaction.create({
  name: 'ApproveKickoutRequest',
  action: Action.create({ name: 'approveKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true })
    ]
  }),
  conditions: CanApproveKickoutRequest
});

export const UpdateKickoutRequest = Interaction.create({
  name: 'UpdateKickoutRequest',
  action: Action.create({ name: 'updateKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  }),
  conditions: AdminOrLeaderRole
});

export const CancelKickoutRequest = Interaction.create({
  name: 'CancelKickoutRequest',
  action: Action.create({ name: 'cancelKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  }),
  conditions: AdminOrLeaderRole
});

// User Management Interactions
export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'role' })
    ]
  }),
  conditions: AdminRole
});

export const UpdateUser = Interaction.create({
  name: 'UpdateUser',
  action: Action.create({ name: 'updateUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'email' }),
      PayloadItem.create({ name: 'role' })
    ]
  }),
  conditions: AdminRole
});

export const DeactivateUser = Interaction.create({
  name: 'DeactivateUser',
  action: Action.create({ name: 'deactivateUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  }),
  conditions: AdminRole
});

export const ReactivateUser = Interaction.create({
  name: 'ReactivateUser',
  action: Action.create({ name: 'reactivateUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  }),
  conditions: AdminRole
});

// Query Interactions
export const GetDormitoryDetails = Interaction.create({
  name: 'GetDormitoryDetails',
  action: Action.create({ name: 'getDormitoryDetails' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

export const GetAllDormitories = Interaction.create({
  name: 'GetAllDormitories',
  action: Action.create({ name: 'getAllDormitories' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'includeInactive' })
    ]
  })
});

export const GetUserDetails = Interaction.create({
  name: 'GetUserDetails',
  action: Action.create({ name: 'getUserDetails' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const GetUserViolations = Interaction.create({
  name: 'GetUserViolations',
  action: Action.create({ name: 'getUserViolations' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const GetPendingKickoutRequests = Interaction.create({
  name: 'GetPendingKickoutRequests',
  action: Action.create({ name: 'getPendingKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const GetDormitoryResidents = Interaction.create({
  name: 'GetDormitoryResidents',
  action: Action.create({ name: 'getDormitoryResidents' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'includeInactive' })
    ]
  })
});

export const GetAvailableBeds = Interaction.create({
  name: 'GetAvailableBeds',
  action: Action.create({ name: 'getAvailableBeds' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  })
});

export const GetUserAssignmentHistory = Interaction.create({
  name: 'GetUserAssignmentHistory',
  action: Action.create({ name: 'getUserAssignmentHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

// Export all interactions
export const interactions = [
  CreateDormitory,
  CreateBedSpace,
  UpdateDormitory,
  AssignDormLeader,
  AssignUserToBed,
  TransferUser,
  RemoveUserFromDormitory,
  ReportViolation,
  UpdateViolation,
  DeleteViolation,
  SubmitKickoutRequest,
  ApproveKickoutRequest,
  UpdateKickoutRequest,
  CancelKickoutRequest,
  CreateUser,
  UpdateUser,
  DeactivateUser,
  ReactivateUser,
  GetDormitoryDetails,
  GetAllDormitories,
  GetUserDetails,
  GetUserViolations,
  GetPendingKickoutRequests,
  GetDormitoryResidents,
  GetAvailableBeds,
  GetUserAssignmentHistory
];