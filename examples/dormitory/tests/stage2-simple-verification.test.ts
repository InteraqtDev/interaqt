import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, MatchExp, MonoSystem } from 'interaqt';
import { createController, entities, relations, interactions } from '../backend/index';

describe('Dormitory Management System - Stage 2: Simple Verification', () => {
    let controller: any;
    
    beforeAll(async () => {
        // Create system
        const system = new MonoSystem();
        
        // Create controller
        controller = createController(system);
        
        // Setup the system
        await controller.setup(true);
    });
    
    afterAll(async () => {
        // Cleanup if needed
    });
    
    describe('Basic Functionality Verification', () => {
        it('should create a dormitory with valid capacity', async () => {
            // Create admin user first
            const adminResult = await controller.callInteraction('CreateUser', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { userData: { name: 'Admin', email: 'admin@test.com' } }
            });
            
            expect(adminResult.error).toBeUndefined();
            
            // Create dormitory with valid capacity
            const dormResult = await controller.callInteraction('CreateDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { dormitoryData: { name: 'Test Dorm', capacity: 5 } }
            });
            
            expect(dormResult.error).toBeUndefined();
        });
        
        it('should create users with different roles', async () => {
            // Create admin
            const adminResult = await controller.callInteraction('CreateUser', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { userData: { name: 'Admin User', email: 'admin2@test.com' } }
            });
            
            expect(adminResult.error).toBeUndefined();
            
            // Create student
            const studentResult = await controller.callInteraction('CreateUser', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { userData: { name: 'Student User', email: 'student@test.com' } }
            });
            
            expect(studentResult.error).toBeUndefined();
        });
        
        it('should list dormitories', async () => {
            const result = await controller.callInteraction('ListDormitories', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' }
            });
            
            expect(result.error).toBeUndefined();
            expect(Array.isArray(result.data)).toBe(true);
        });
    });
});