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
} from '../backend/minimal.js';

// Test with minimal implementation to isolate scheduler error
describe('Minimal Test - Debug Scheduler Error', () => {
  let system: MonoSystem;
  let controller: Controller;

  beforeEach(async () => {
    console.log('Setting up minimal test...');
    
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

    console.log('About to call controller.setup()...');
    await controller.setup(true);  // Add install parameter like in CRUD example
    console.log('Controller setup completed successfully!');
  });

  test('should setup controller without errors', async () => {
    console.log('Creating test user...');
    const testUser = await system.storage.create('User', {
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'admin'
    });

    console.log('Creating dormitory directly via storage...');
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Test Dormitory',
      capacity: 4
    });

    expect(dormitory.name).toBe('Test Dormitory');
    expect(dormitory.capacity).toBe(4);

    console.log('✅ Basic setup test passed!');
  });
});