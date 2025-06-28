/**
 * Auto-generated Interaction Functions
 * Generated from: src/interactions.ts
 * Generated at: 2025-06-28T13:34:08.282Z
 * 
 * This file contains automatically generated functions for calling backend interactions.
 * Each function is a simple async function that returns the response data directly.
 */

// Base configuration
const BASE_URL = 'http://localhost:3000';

// Types
interface InteractionRequest {
  interaction: string;
  payload?: any;
  query?: any;
}

// Utility function to get current user ID (should be implemented by the app)
function getCurrentUserId(): string | null {
  // This should be implemented by the app
  // For now, try to get from URL params
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('userId') || null;
}


/**
 * CreateDormitory - Auto-generated function
 */
export async function createDormitory(name: any, building: any, roomNumber: any, capacity: any, description: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'CreateDormitory',
        payload: { name, building, roomNumber, capacity, description }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * AssignDormitoryLeader - Auto-generated function
 */
export async function assignDormitoryLeader(dormitoryId: any, userId: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'AssignDormitoryLeader',
        payload: { dormitoryId, userId }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * AssignMemberToDormitory - Auto-generated function
 */
export async function assignMemberToDormitory(dormitoryId: any, userId: any, bedNumber: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'AssignMemberToDormitory',
        payload: { dormitoryId, userId, bedNumber }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * ApproveKickRequest - Auto-generated function
 */
export async function approveKickRequest(kickRequestId: any, adminComment: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'ApproveKickRequest',
        payload: { kickRequestId, adminComment }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * RejectKickRequest - Auto-generated function
 */
export async function rejectKickRequest(kickRequestId: any, adminComment: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'RejectKickRequest',
        payload: { kickRequestId, adminComment }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * AdminApproveApplication - Auto-generated function
 */
export async function adminApproveApplication(applicationId: any, adminComment: any, bedNumber: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'AdminApproveApplication',
        payload: { applicationId, adminComment, bedNumber }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * AdminRejectApplication - Auto-generated function
 */
export async function adminRejectApplication(applicationId: any, adminComment: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'AdminRejectApplication',
        payload: { applicationId, adminComment }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * LeaderApproveApplication - Auto-generated function
 */
export async function leaderApproveApplication(applicationId: any, leaderComment: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'LeaderApproveApplication',
        payload: { applicationId, leaderComment }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * LeaderRejectApplication - Auto-generated function
 */
export async function leaderRejectApplication(applicationId: any, leaderComment: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'LeaderRejectApplication',
        payload: { applicationId, leaderComment }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * RecordScore - Auto-generated function
 */
export async function recordScore(memberId: any, points: any, reason: any, category: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'RecordScore',
        payload: { memberId, points, reason, category }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * RequestKickMember - Auto-generated function
 */
export async function requestKickMember(memberId: any, reason: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'RequestKickMember',
        payload: { memberId, reason }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * ApplyForDormitory - Auto-generated function
 */
export async function applyForDormitory(dormitoryId: any, message: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'ApplyForDormitory',
        payload: { dormitoryId, message }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * CancelApplication - Auto-generated function
 */
export async function cancelApplication(applicationId: any, query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'CancelApplication',
        payload: { applicationId }
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetDormitories - Auto-generated function
 */
export async function getDormitories(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetDormitories',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetUsers - Auto-generated function
 */
export async function getUsers(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetUsers',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetDormitoryMembers - Auto-generated function
 */
export async function getDormitoryMembers(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetDormitoryMembers',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetApplications - Auto-generated function
 */
export async function getApplications(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetApplications',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetScoreRecords - Auto-generated function
 */
export async function getScoreRecords(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetScoreRecords',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}


/**
 * GetKickRequests - Auto-generated function
 */
export async function getKickRequests(query?: any): Promise<any> {
  const request: InteractionRequest = {
        interaction: 'GetKickRequests',
        query
      };
  
  const response = await fetch(`${BASE_URL}/interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getCurrentUserId()}`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data || result.result || result;
}

// Export all functions as a single object for convenience
export const interactionFunctions = {
  createDormitory,
  assignDormitoryLeader,
  assignMemberToDormitory,
  approveKickRequest,
  rejectKickRequest,
  adminApproveApplication,
  adminRejectApplication,
  leaderApproveApplication,
  leaderRejectApplication,
  recordScore,
  requestKickMember,
  applyForDormitory,
  cancelApplication,
  getDormitories,
  getUsers,
  getDormitoryMembers,
  getApplications,
  getScoreRecords,
  getKickRequests
};

// Export function names for reference
export const availableInteractions = [
  'CreateDormitory',
  'AssignDormitoryLeader',
  'AssignMemberToDormitory',
  'ApproveKickRequest',
  'RejectKickRequest',
  'AdminApproveApplication',
  'AdminRejectApplication',
  'LeaderApproveApplication',
  'LeaderRejectApplication',
  'RecordScore',
  'RequestKickMember',
  'ApplyForDormitory',
  'CancelApplication',
  'GetDormitories',
  'GetUsers',
  'GetDormitoryMembers',
  'GetApplications',
  'GetScoreRecords',
  'GetKickRequests'
];
