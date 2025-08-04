import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, MatchExp, MonoSystem } from 'interaqt';
import { createController, entities, relations, interactions } from '../backend/index';

describe('Dormitory Management System - Stage 2: Permissions and Business Rules', () => {
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
    
    // Helper function to create test users
    async function createTestUser(userData: any) {
        const result = await controller.callInteraction('CreateUser', {
            user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
            payload: { userData }
        });
        
        if (result.error) {
            throw new Error(`Failed to create user: ${JSON.stringify(result.error)}`);
        }
        
        return result.effects?.[0]?.record;
    }
    
    // Helper function to create test dormitory
    async function createTestDormitory(dormData: any) {
        const result = await controller.callInteraction('CreateDormitory', {
            user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
            payload: { dormitoryData: dormData }
        });
        
        if (result.error) {
            throw new Error(`Failed to create dormitory: ${JSON.stringify(result.error)}`);
        }
        
        return result.effects?.[0]?.record;
    }
    
    describe('Permission Tests', () => {
        describe('PT001: Admin Permissions', () => {
            it('should allow admin to create dormitory', async () => {
                // Create admin user
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                // Create dormitory with admin role
                const result = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Admin Dorm', capacity: 4 } }
                });
                
                expect(result.error).toBeUndefined();
                expect(result.effects?.[0]?.record).toMatchObject({
                    name: 'Admin Dorm',
                    capacity: 4
                });
            });
            
            it('should allow admin to assign dorm head', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dorm = await createTestDormitory({
                    name: 'Test Dorm',
                    capacity: 4
                });
                
                const user = await createTestUser({
                    name: 'User',
                    email: 'user@test.com'
                });
                
                // Assign dorm head with admin role
                const result = await controller.callInteraction('AssignDormHead', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryId: dorm.id, headId: user.id }
                });
                
                expect(result.error).toBeUndefined();
            });
            
            it('should allow admin to approve eviction', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dormHead = await createTestUser({
                    name: 'Dorm Head',
                    email: 'head@test.com'
                });
                
                const dorm = await createTestDormitory({
                    name: 'Test Dorm',
                    capacity: 4
                });
                
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                // Create eviction request
                const evictionResult = await controller.callInteraction('RequestEviction', {
                    user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                    payload: { userId: student.id, reason: 'Test reason' }
                });
                
                const evictionRequest = evictionResult.effects?.[0]?.record;
                
                // Approve eviction with admin role
                const result = await controller.callInteraction('ApproveEviction', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { requestId: evictionRequest.id, approved: true }
                });
                
                expect(result.error).toBeUndefined();
            });
        });
        
        describe('PT002: Dorm Head Permissions', () => {
            it('should allow dorm head to create behavior record', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dormHead = await createTestUser({
                    name: 'Dorm Head',
                    email: 'head@test.com'
                });
                
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                // Create behavior record with dorm head role
                const result = await controller.callInteraction('CreateBehaviorRecord', {
                    user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                    payload: { userId: student.id, points: -5, reason: 'Late arrival' }
                });
                
                expect(result.error).toBeUndefined();
                expect(result.effects?.[0]?.record).toMatchObject({
                    points: -5,
                    reason: 'Late arrival'
                });
            });
            
            it('should allow dorm head to request eviction', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dormHead = await createTestUser({
                    name: 'Dorm Head',
                    email: 'head@test.com'
                });
                
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                // Request eviction with dorm head role
                const result = await controller.callInteraction('RequestEviction', {
                    user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                    payload: { userId: student.id, reason: 'Violation' }
                });
                
                expect(result.error).toBeUndefined();
                expect(result.effects?.[0]?.record).toMatchObject({
                    reason: 'Violation',
                    status: 'pending'
                });
            });
        });
        
        describe('PT003: Permission Denials', () => {
            it('should deny student creating dormitory', async () => {
                // Create student user
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                // Try to create dormitory with student role
                const result = await controller.callInteraction('CreateDormitory', {
                    user: { id: student.id, name: 'Student', email: 'student@test.com', role: 'student' },
                    payload: { dormitoryData: { name: 'Student Dorm', capacity: 4 } }
                });
                
                expect(result.error).toBeDefined();
            });
            
            it('should deny student assigning dorm head', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                const dorm = await createTestDormitory({
                    name: 'Test Dorm',
                    capacity: 4
                });
                
                // Try to assign dorm head with student role
                const result = await controller.callInteraction('AssignDormHead', {
                    user: { id: student.id, name: 'Student', email: 'student@test.com', role: 'student' },
                    payload: { dormitoryId: dorm.id, headId: student.id }
                });
                
                expect(result.error).toBeDefined();
            });
            
            it('should deny student approving eviction', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dormHead = await createTestUser({
                    name: 'Dorm Head',
                    email: 'head@test.com'
                });
                
                const student = await createTestUser({
                    name: 'Student',
                    email: 'student@test.com'
                });
                
                const dorm = await createTestDormitory({
                    name: 'Test Dorm',
                    capacity: 4
                });
                
                // Create eviction request
                const evictionResult = await controller.callInteraction('RequestEviction', {
                    user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                    payload: { userId: student.id, reason: 'Test reason' }
                });
                
                const evictionRequest = evictionResult.effects?.[0]?.record;
                
                // Try to approve eviction with student role
                const result = await controller.callInteraction('ApproveEviction', {
                    user: { id: student.id, name: 'Student', email: 'student@test.com', role: 'student' },
                    payload: { requestId: evictionRequest.id, approved: true }
                });
                
                expect(result.error).toBeDefined();
            });
        });
        
        describe('PT004: Query Permissions', () => {
            it('should allow student to view dormitory', async () => {
                // Create test data
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                const dorm = await createTestDormitory({
                    name: 'Test Dorm',
                    capacity: 4
                });
                
                // Get dormitory with student role
                const result = await controller.callInteraction('GetDormitory', {
                    user: { id: 'student1', name: 'Student', email: 'student@test.com', role: 'student' },
                    payload: { id: dorm.id }
                });
                
                expect(result.error).toBeUndefined();
                expect(result.data).toMatchObject({
                    id: dorm.id,
                    name: 'Test Dorm'
                });
            });
            
            it('should allow student to list dormitories', async () => {
                // List dormitories with student role
                const result = await controller.callInteraction('ListDormitories', {
                    user: { id: 'student1', name: 'Student', email: 'student@test.com', role: 'student' }
                });
                
                expect(result.error).toBeUndefined();
                expect(Array.isArray(result.data)).toBe(true);
            });
        });
    });
    
    describe('Business Rule Tests', () => {
        describe('BR001: Dormitory Capacity Validation', () => {
            it('should reject dormitory with capacity less than 4', async () => {
                // Create admin user
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                // Try to create dormitory with invalid capacity
                const result = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Small Dorm', capacity: 3 } }
                });
                
                expect(result.error).toBeDefined();
            });
            
            it('should reject dormitory with capacity greater than 6', async () => {
                // Create admin user
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                // Try to create dormitory with invalid capacity
                const result = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Large Dorm', capacity: 7 } }
                });
                
                expect(result.error).toBeDefined();
            });
            
            it('should accept dormitory with capacity between 4 and 6', async () => {
                // Create admin user
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                // Create dormitory with valid capacity
                const result = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Valid Dorm', capacity: 5 } }
                });
                
                expect(result.error).toBeUndefined();
                expect(result.effects?.[0]?.record).toMatchObject({
                    name: 'Valid Dorm',
                    capacity: 5
                });
            });
        });
        
        describe('BR002: Business Rule Edge Cases', () => {
            it('should handle boundary values exactly', async () => {
                // Create admin user
                const admin = await createTestUser({
                    name: 'Admin',
                    email: 'admin@test.com'
                });
                
                // Test minimum capacity
                const result1 = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Min Dorm', capacity: 4 } }
                });
                
                expect(result1.error).toBeUndefined();
                
                // Test maximum capacity
                const result2 = await controller.callInteraction('CreateDormitory', {
                    user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                    payload: { dormitoryData: { name: 'Max Dorm', capacity: 6 } }
                });
                
                expect(result2.error).toBeUndefined();
            });
        });
    });
    
    describe('Complex Permission Scenarios', () => {
        it('should handle OR conditions in permissions correctly', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dormHead = await createTestUser({
                name: 'Dorm Head',
                email: 'head@test.com'
            });
            
            const student = await createTestUser({
                name: 'Student',
                email: 'student@test.com'
            });
            
            // Test that both admin and dorm head can create behavior records
            for (const user of [admin, dormHead]) {
                const result = await controller.callInteraction('CreateBehaviorRecord', {
                    user: { id: user.id, name: user.name, email: user.email, role: user.role },
                    payload: { userId: student.id, points: -5, reason: 'Test' }
                });
                
                expect(result.error).toBeUndefined();
            }
            
            // Test that student cannot create behavior records
            const result = await controller.callInteraction('CreateBehaviorRecord', {
                user: { id: student.id, name: 'Student', email: 'student@test.com', role: 'student' },
                payload: { userId: admin.id, points: -5, reason: 'Test' }
            });
            
            expect(result.error).toBeDefined();
        });
    });
});