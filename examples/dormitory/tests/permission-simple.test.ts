import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB } from 'interaqt';
import { entities, relations, interactions } from '../backend/index.js';

describe('Simple Permission Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  let adminUser: any;
  let studentUser: any;

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB());
    
    controller = new Controller(
      system,
      entities,
      relations,
      [], // activities
      interactions,
      [], // dictionaries
      [] // side effects
    );

    await controller.setup(true);

    // Create test users
    adminUser = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@test.com',
      phone: '1234567890',
      role: 'admin'
    });

    studentUser = await system.storage.create('User', {
      name: 'Student User',
      email: 'student@test.com',
      phone: '1234567891',
      role: 'student'
    });
  });

  // Test basic admin permission
  test('admin can create dormitory', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Test101',
        building: 'Test栋',
        floor: 1,
        capacity: 4
      }
    });

    expect(result.error).toBeUndefined();
  });

  // Test basic student permission denial
  test('student cannot create dormitory', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: studentUser,
      payload: {
        name: 'Test102',
        building: 'Test栋',
        floor: 1,
        capacity: 4
      }
    });

    expect(result.error).toBeDefined();
    console.log('Error:', result.error);
  });

  // Test admin can view all dormitories
  test('admin can view all dormitories', async () => {
    const result = await controller.callInteraction('ViewAllDormitories', {
      user: adminUser,
      payload: {}
    });

    expect(result.error).toBeUndefined();
  });

  // Test student cannot view all dormitories
  test('student cannot view all dormitories', async () => {
    const result = await controller.callInteraction('ViewAllDormitories', {
      user: studentUser,
      payload: {}
    });

    expect(result.error).toBeDefined();
    console.log('Error:', result.error);
  });
});