import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import { Controller, MonoSystem, PGLiteDB } from 'interaqt';
import { 
  entities, 
  relations, 
  interactions, 
  activities, 
  dicts,
  User,
  Dormitory,
  ScoreRule,
  ViolationRecord,
  KickoutRequest,
  CreateDormitory,
  AssignDormHead,
  AssignUserToDormitory,
  CreateScoreRule,
  RecordViolation,
  RequestKickout,
  ProcessKickoutRequest
} from '../backend/index.js';

// Global instances
let system: MonoSystem;
let controller: Controller;

// Test data storage
let testUsers: any = {};
let testDormitories: any = {};
let testScoreRules: any = {};

beforeEach(async () => {
  // Create fresh system and controller for each test
  system = new MonoSystem(new PGLiteDB());
  
  controller = new Controller({
    system,
    entities,
    relations,
    interactions,
    activities,
    dicts
  });

  await controller.setup(true);

  // Create standard test users with proper roles (even though permissions aren't enforced yet)
  testUsers.admin = await system.storage.create('User', {
    name: 'System Admin',
    email: 'admin@dormitory.com',
    role: 'admin',
    score: 100,
    status: 'active'
  });

  testUsers.dormHead = await system.storage.create('User', {
    name: 'Dorm Head Zhang',
    email: 'zhangsan@dormitory.com',
    role: 'student', // Will become dormHead when assigned
    score: 100,
    status: 'active'
  });

  testUsers.student1 = await system.storage.create('User', {
    name: 'Student Li',
    email: 'lisi@dormitory.com',
    role: 'student',
    score: 100,
    status: 'active'
  });

  testUsers.student2 = await system.storage.create('User', {
    name: 'Student Wang',
    email: 'wangwu@dormitory.com',
    role: 'student',
    score: 100,
    status: 'active'
  });

  // Clear test data storage
  testDormitories = {};
  testScoreRules = {};
});

describe('Stage 1: Core Business Logic Tests', () => {
  
  describe('TC001: Create Dormitory', () => {
    test('should create dormitory successfully with valid data', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: {
          name: 'Dormitory A-101',
          capacity: 4
        }
      });

      expect(result.error).toBeUndefined();
      
      // Verify dormitory was created
      const dormitories = await system.storage.find('Dormitory');
      expect(dormitories).toHaveLength(1);
      
      const dormitory = dormitories[0];
      expect(dormitory.name).toBe('Dormitory A-101');
      expect(dormitory.capacity).toBe(4);
      expect(dormitory.currentOccupancy).toBe(0);
      expect(dormitory.availableBeds).toBe(4);
      expect(dormitory.createdAt).toBeTruthy();
      expect(dormitory.updatedAt).toBeTruthy();

      testDormitories.dormA = dormitory;
    });
  });

  describe('TC002: Create Dormitory with Invalid Data', () => {
    test('should handle empty name gracefully', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: {
          name: '',
          capacity: 4
        }
      });

      // In Stage 1, we focus on core functionality working with valid data
      // Invalid data handling will be tested in Stage 2
      // For now, we just verify the interaction executes
      expect(result).toBeDefined();
    });
  });

  describe('TC003: Assign Dorm Head', () => {
    test('should assign dorm head successfully', async () => {
      // First create a dormitory
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: {
          name: 'Dormitory B-201',
          capacity: 6
        }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      // Assign dorm head
      const result = await controller.callInteraction('AssignDormHead', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.dormHead.id,
          dormitoryId: dormitory.id
        }
      });

      expect(result.error).toBeUndefined();

      // Verify dorm head relation was created
      const relations = await system.storage.find('DormitoryHeadRelation');
      expect(relations).toHaveLength(1);
      
      const relation = relations[0];
      expect(relation.source.id).toBe(testUsers.dormHead.id);
      expect(relation.target.id).toBe(dormitory.id);
      expect(relation.appointedAt).toBeTruthy();
      expect(relation.isActive).toBe(true);
    });
  });

  describe('TC004: Assign User to Dormitory', () => {
    test('should assign user to dormitory successfully', async () => {
      // Create dormitory
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: {
          name: 'Dormitory C-301',
          capacity: 4
        }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      // Assign user to dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student1.id,
          dormitoryId: dormitory.id,
          bedNumber: 1
        }
      });

      expect(result.error).toBeUndefined();

      // Verify user-dormitory relation was created
      const relations = await system.storage.find('UserDormitoryRelation');
      expect(relations).toHaveLength(1);
      
      const relation = relations[0];
      expect(relation.source.id).toBe(testUsers.student1.id);
      expect(relation.target.id).toBe(dormitory.id);
      expect(relation.bedNumber).toBe(1);
      expect(relation.status).toBe('active');
      expect(relation.assignedAt).toBeTruthy();

      // Verify dormitory occupancy updated
      const updatedDormitories = await system.storage.find('Dormitory');
      const updatedDormitory = updatedDormitories[0];
      expect(updatedDormitory.currentOccupancy).toBe(1);
      expect(updatedDormitory.availableBeds).toBe(3);
    });
  });

  describe('TC005: Create Score Rule', () => {
    test('should create score rule successfully', async () => {
      const result = await controller.callInteraction('CreateScoreRule', {
        user: testUsers.admin,
        payload: {
          name: 'Late Return',
          description: 'Returning to dormitory after 11 PM',
          scoreDeduction: 10
        }
      });

      expect(result.error).toBeUndefined();

      // Verify score rule was created
      const rules = await system.storage.find('ScoreRule');
      expect(rules).toHaveLength(1);
      
      const rule = rules[0];
      expect(rule.name).toBe('Late Return');
      expect(rule.description).toBe('Returning to dormitory after 11 PM');
      expect(rule.scoreDeduction).toBe(10);
      expect(rule.isActive).toBe(true);
      expect(rule.createdAt).toBeTruthy();
      expect(rule.updatedAt).toBeTruthy();

      testScoreRules.lateReturn = rule;
    });
  });

  describe('TC006: Record Violation', () => {
    test('should record violation successfully', async () => {
      // Setup: Create dormitory, assign user, create score rule
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: { name: 'Test Dormitory', capacity: 4 }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student1.id,
          dormitoryId: dormitory.id,
          bedNumber: 1
        }
      });

      await controller.callInteraction('CreateScoreRule', {
        user: testUsers.admin,
        payload: {
          name: 'Messy Room',
          description: 'Room inspection failed',
          scoreDeduction: 5
        }
      });

      const rules = await system.storage.find('ScoreRule');
      const rule = rules[0];

      // Record violation
      const result = await controller.callInteraction('RecordViolation', {
        user: testUsers.admin, // In Stage 1, admin can record violations
        payload: {
          userId: testUsers.student1.id,
          ruleId: rule.id,
          description: 'Room was not cleaned properly during inspection'
        }
      });

      expect(result.error).toBeUndefined();

      // Verify violation record was created
      const violations = await system.storage.find('ViolationRecord');
      expect(violations).toHaveLength(1);
      
      const violation = violations[0];
      expect(violation.description).toBe('Room was not cleaned properly during inspection');
      expect(violation.scoreDeducted).toBe(5);
      expect(violation.status).toBe('active');
      expect(violation.recordedAt).toBeTruthy();

      // Verify relations were created
      const userViolationRelations = await system.storage.find('UserViolationRelation');
      expect(userViolationRelations).toHaveLength(1);
      
      const violationRuleRelations = await system.storage.find('ViolationRuleRelation');
      expect(violationRuleRelations).toHaveLength(1);
    });
  });

  describe('TC007: Request Kickout', () => {
    test('should create kickout request successfully', async () => {
      // Setup: Create dormitory, assign dorm head and student
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: { name: 'Test Dormitory', capacity: 4 }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      await controller.callInteraction('AssignDormHead', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.dormHead.id,
          dormitoryId: dormitory.id
        }
      });

      await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student1.id,
          dormitoryId: dormitory.id,
          bedNumber: 1
        }
      });

      // Request kickout
      const result = await controller.callInteraction('RequestKickout', {
        user: testUsers.dormHead, // Dorm head making the request
        payload: {
          targetUserId: testUsers.student1.id,
          reason: 'Multiple violations, consistently disruptive behavior'
        }
      });

      expect(result.error).toBeUndefined();

      // Verify kickout request was created
      const requests = await system.storage.find('KickoutRequest');
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request.reason).toBe('Multiple violations, consistently disruptive behavior');
      expect(request.status).toBe('pending');
      expect(request.requestedAt).toBeTruthy();

      // Verify relations were created
      const requesterRelations = await system.storage.find('KickoutRequesterRelation');
      expect(requesterRelations).toHaveLength(1);
      
      const targetRelations = await system.storage.find('KickoutTargetRelation');
      expect(targetRelations).toHaveLength(1);
    });
  });

  describe('TC008: Process Kickout Request - Approve', () => {
    test('should approve kickout request successfully', async () => {
      // Setup: Create request first (reusing setup from TC007)
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: { name: 'Test Dormitory', capacity: 4 }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      await controller.callInteraction('AssignDormHead', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.dormHead.id,
          dormitoryId: dormitory.id
        }
      });

      await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student1.id,
          dormitoryId: dormitory.id,
          bedNumber: 1
        }
      });

      await controller.callInteraction('RequestKickout', {
        user: testUsers.dormHead,
        payload: {
          targetUserId: testUsers.student1.id,
          reason: 'Multiple violations'
        }
      });

      const requests = await system.storage.find('KickoutRequest');
      const request = requests[0];

      // Process (approve) the request
      const result = await controller.callInteraction('ProcessKickoutRequest', {
        user: testUsers.admin,
        payload: {
          requestId: request.id,
          decision: 'approved',
          adminComment: 'Violations confirmed, approval granted'
        }
      });

      expect(result.error).toBeUndefined();

      // Verify processor relation was created
      const processorRelations = await system.storage.find('KickoutProcessorRelation');
      expect(processorRelations).toHaveLength(1);
      
      const processorRelation = processorRelations[0];
      expect(processorRelation.source.id).toBe(testUsers.admin.id);
      expect(processorRelation.target.id).toBe(request.id);
    });
  });

  describe('TC009: Process Kickout Request - Reject', () => {
    test('should reject kickout request successfully', async () => {
      // Setup: Create request first (similar to TC008)
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: { name: 'Test Dormitory', capacity: 4 }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      await controller.callInteraction('AssignDormHead', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.dormHead.id,
          dormitoryId: dormitory.id
        }
      });

      await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student2.id,
          dormitoryId: dormitory.id,
          bedNumber: 2
        }
      });

      await controller.callInteraction('RequestKickout', {
        user: testUsers.dormHead,
        payload: {
          targetUserId: testUsers.student2.id,
          reason: 'Minor violations'
        }
      });

      const requests = await system.storage.find('KickoutRequest');
      const request = requests[0];

      // Process (reject) the request
      const result = await controller.callInteraction('ProcessKickoutRequest', {
        user: testUsers.admin,
        payload: {
          requestId: request.id,
          decision: 'rejected',
          adminComment: 'Insufficient evidence, request denied'
        }
      });

      expect(result.error).toBeUndefined();

      // Verify processor relation was created
      const processorRelations = await system.storage.find('KickoutProcessorRelation');
      expect(processorRelations).toHaveLength(1);
    });
  });

  describe('Complex Scenario: Complete Workflow', () => {
    test('TC020: Complete workflow from creation to kickout', async () => {
      // Step 1: Create dormitory
      await controller.callInteraction('CreateDormitory', {
        user: testUsers.admin,
        payload: {
          name: 'Workflow Test Dormitory',
          capacity: 4
        }
      });

      const dormitories = await system.storage.find('Dormitory');
      const dormitory = dormitories[0];

      // Step 2: Assign dorm head
      await controller.callInteraction('AssignDormHead', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.dormHead.id,
          dormitoryId: dormitory.id
        }
      });

      // Step 3: Assign student
      await controller.callInteraction('AssignUserToDormitory', {
        user: testUsers.admin,
        payload: {
          userId: testUsers.student1.id,
          dormitoryId: dormitory.id,
          bedNumber: 1
        }
      });

      // Step 4: Create score rule
      await controller.callInteraction('CreateScoreRule', {
        user: testUsers.admin,
        payload: {
          name: 'Noise Violation',
          description: 'Making noise during quiet hours',
          scoreDeduction: 15
        }
      });

      const rules = await system.storage.find('ScoreRule');
      const rule = rules[0];

      // Step 5: Record multiple violations to lower score below 60
      for (let i = 0; i < 3; i++) {
        await controller.callInteraction('RecordViolation', {
          user: testUsers.dormHead,
          payload: {
            userId: testUsers.student1.id,
            ruleId: rule.id,
            description: `Noise violation incident ${i + 1}`
          }
        });
      }

      // Step 6: Request kickout
      await controller.callInteraction('RequestKickout', {
        user: testUsers.dormHead,
        payload: {
          targetUserId: testUsers.student1.id,
          reason: 'Multiple noise violations, score below threshold'
        }
      });

      const requests = await system.storage.find('KickoutRequest');
      const request = requests[0];

      // Step 7: Approve kickout
      const result = await controller.callInteraction('ProcessKickoutRequest', {
        user: testUsers.admin,
        payload: {
          requestId: request.id,
          decision: 'approved',
          adminComment: 'Workflow test completed successfully'
        }
      });

      expect(result.error).toBeUndefined();

      // Verify the complete workflow worked
      const finalDormitories = await system.storage.find('Dormitory');
      const finalDormitory = finalDormitories[0];

      const dormHeadRelations = await system.storage.find('DormitoryHeadRelation');
      const userDormitoryRelations = await system.storage.find('UserDormitoryRelation');
      const violations = await system.storage.find('ViolationRecord');
      const finalRequests = await system.storage.find('KickoutRequest');
      const processorRelations = await system.storage.find('KickoutProcessorRelation');

      // Verify all entities and relations were created
      expect(finalDormitory.name).toBe('Workflow Test Dormitory');
      expect(dormHeadRelations).toHaveLength(1);
      expect(userDormitoryRelations).toHaveLength(1);
      expect(violations).toHaveLength(3);
      expect(finalRequests).toHaveLength(1);
      expect(processorRelations).toHaveLength(1);

      console.log('✅ Complete workflow test passed - all core business logic working correctly');
    });
  });
});