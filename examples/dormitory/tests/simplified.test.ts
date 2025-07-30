import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB } from 'interaqt';
import { 
  entities, 
  relations, 
  interactions, 
  activities, 
  dicts,
  User,
  Dormitory
} from '../backend/simplified.js';

// Test Stage 1 core logic without Transform computations
describe('Simplified Stage 1 - Core Business Logic', () => {
  let system: MonoSystem;
  let controller: Controller;
  let testUsers: any = {};

  beforeEach(async () => {
    // Create fresh system and controller
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

    // Create test users
    testUsers.admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin',
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
  });

  test('should create dormitory via direct storage', async () => {
    // Test creating dormitory directly via storage (bypassing interactions for now)
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Dormitory A-101',
      capacity: 4,
      availableBeds: 4
    });

    expect(dormitory.name).toBe('Dormitory A-101');
    expect(dormitory.capacity).toBe(4);
    expect(dormitory.availableBeds).toBe(4);

    // Verify it was saved
    const dormitories = await system.storage.find('Dormitory');
    expect(dormitories).toHaveLength(1);
    expect(dormitories[0].name).toBe('Dormitory A-101');

    console.log('✅ Direct storage creation works');
  });

  test('should create relation via direct storage', async () => {
    // Create dormitory first
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Test Dormitory',
      capacity: 4,
      availableBeds: 4
    });

    // Create relation directly
    const relation = await system.storage.create('UserDormitoryRelation', {
      source: { id: testUsers.student1.id },
      target: { id: dormitory.id },
      bedNumber: 1,
      status: 'active'
    });

    expect(relation.bedNumber).toBe(1);
    expect(relation.status).toBe('active');

    // Verify relation was created
    const relations = await system.storage.find('UserDormitoryRelation');
    expect(relations).toHaveLength(1);

    console.log('✅ Direct relation creation works');
  });

  test('should call interactions without Transform computations', async () => {
    // Since we removed Transform computations, interactions should execute but not create entities automatically
    // This tests that the interaction system itself works
    
    const result = await controller.callInteraction('CreateDormitory', {
      user: testUsers.admin,
      payload: {
        name: 'Test Dormitory',
        capacity: 4
      }
    });

    // Interaction should succeed (no conditions to fail)
    expect(result.error).toBeUndefined();

    // But no dormitory should be created automatically since there's no Transform computation
    const dormitories = await system.storage.find('Dormitory');
    expect(dormitories).toHaveLength(0);

    console.log('✅ Interaction system works without Transform computations');
  });

  test('should handle assignment interaction', async () => {
    // Create dormitory manually first
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Assignment Test Dorm',
      capacity: 4,
      availableBeds: 4
    });

    const result = await controller.callInteraction('AssignUserToDormitory', {
      user: testUsers.admin,
      payload: {
        userId: testUsers.student1.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    // Interaction should succeed
    expect(result.error).toBeUndefined();

    // No automatic relation creation since there's no Transform computation
    const relations = await system.storage.find('UserDormitoryRelation');
    expect(relations).toHaveLength(0);

    console.log('✅ Assignment interaction works without Transform computations');
  });
});