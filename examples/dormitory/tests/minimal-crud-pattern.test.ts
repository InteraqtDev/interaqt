import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt';
import { 
  User, 
  Dormitory, 
  CreateDormitory,
  entities, 
  relations, 
  interactions
} from '../backend/minimal-crud-pattern.js';

// Test following CRUD example patterns exactly
describe('Minimal CRUD Pattern Test', () => {
  let system: MonoSystem;
  let controller: Controller;

  beforeEach(async () => {
    // Create fresh system and controller for each test - exactly like CRUD example
    system = new MonoSystem(new PGLiteDB());
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    });

    await controller.setup(true);
  });

  test('should create a dormitory using interaction - following CRUD pattern', async () => {
    // Setup: Create a test user exactly like CRUD example
    const testUser = await system.storage.create('User', {
      username: 'admin_user',
      email: 'admin@example.com',
      role: 'admin'
    });

    // Act: Create a dormitory using interaction - like CreateArticle in CRUD example
    const result = await controller.callInteraction('CreateDormitory', {
      user: testUser,
      payload: {
        name: 'Test Dormitory',
        capacity: 4
      }
    });

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined();

    // Verify dormitory was created via Transform computation
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
      undefined,
      ['name', 'capacity', 'createdAt', 'id']
    );
    
    expect(dormitory).toBeTruthy();
    expect(dormitory.name).toBe('Test Dormitory');
    expect(dormitory.capacity).toBe(4);
    expect(dormitory.createdAt).toBeTruthy();

    console.log('✅ CRUD pattern dormitory creation works!');
  });

  test('should create user directly via storage', async () => {
    // Test basic user creation to ensure entities work correctly
    const user = await system.storage.create('User', {
      username: 'test_user',
      email: 'test@example.com',
      role: 'student'
    });

    expect(user.username).toBe('test_user');
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('student');

    // Verify it was saved and can be retrieved
    const foundUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'username', value: ['=', 'test_user'] }),
      undefined,
      ['username', 'email', 'role', 'id']
    );
    
    expect(foundUser).toBeTruthy();
    expect(foundUser.username).toBe('test_user');
    expect(foundUser.email).toBe('test@example.com');
    expect(foundUser.role).toBe('student');

    console.log('✅ Basic user entity works correctly!');
  });
});