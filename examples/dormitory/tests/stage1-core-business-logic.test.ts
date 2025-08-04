import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, MatchExp, MonoSystem } from 'interaqt';
import { createController, entities, relations, interactions } from '../backend/index';

describe('Dormitory Management System - Stage 1: Core Business Logic', () => {
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
    
    describe('TC001: Create Dormitory', () => {
        it('should create a new dormitory with correct properties', async () => {
            // Create admin user first
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            // Create dormitory
            const dorm = await createTestDormitory({
                name: 'Dorm A',
                capacity: 4,
                headId: admin.id
            });
            
            // Verify dormitory properties
            expect(dorm).toMatchObject({
                name: 'Dorm A',
                capacity: 4,
                status: 'active'
            });
            
            // Verify beds were created automatically
            const beds = await controller.system.storage.find('Bed',
                MatchExp.atom({
                    key: 'dormitory.id',
                    value: ['=', dorm.id]
                }),
                undefined,
                ['*']
            );
            
            expect(beds).toHaveLength(4);
            expect(beds[0]).toMatchObject({
                bedNumber: 1,
                isOccupied: false
            });
            
            // Verify head is assigned
            const headRelation = await controller.system.storage.findOneRelationByName('DormitoryHeadRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', dorm.id]
                }),
                undefined,
                ['*']
            );
            
            expect(headRelation).toBeDefined();
            expect(headRelation.target.id).toBe(admin.id);
        });
    });
    
    describe('TC002: Assign User to Dormitory', () => {
        it('should assign user to dormitory and update bed status', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dorm = await createTestDormitory({
                name: 'Dorm B',
                capacity: 6,
                headId: admin.id
            });
            
            const student = await createTestUser({
                name: 'Student',
                email: 'student@test.com'
            });
            
            // Assign user to dormitory
            const result = await controller.callInteraction('AssignUserToDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    dormitoryId: dorm.id,
                    bedNumber: 2
                }
            });
            
            expect(result.error).toBeUndefined();
            
            // Verify user-dormitory relation
            const relation = await controller.system.storage.findOneRelationByName('UserDormitoryRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', student.id]
                }),
                undefined,
                ['*']
            );
            
            expect(relation).toBeDefined();
            expect(relation.target.id).toBe(dorm.id);
            expect(relation.bedNumber).toBe(2);
            expect(relation.status).toBe('active');
            
            // Verify bed is occupied
            const bed = await controller.system.storage.findOne('Bed',
                MatchExp.atom({
                    key: 'dormitory.id',
                    value: ['=', dorm.id]
                }).and(MatchExp.atom({
                    key: 'bedNumber',
                    value: ['=', 2]
                })),
                undefined,
                ['*']
            );
            
            expect(bed.isOccupied).toBe(true);
        });
    });
    
    describe('TC003: Create Behavior Record', () => {
        it('should create behavior record and update user points', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dorm = await createTestDormitory({
                name: 'Dorm C',
                capacity: 4,
                headId: admin.id
            });
            
            const student = await createTestUser({
                name: 'Student',
                email: 'student@test.com'
            });
            
            // Assign user to dormitory
            await controller.callInteraction('AssignUserToDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    dormitoryId: dorm.id,
                    bedNumber: 1
                }
            });
            
            // Create behavior record
            const result = await controller.callInteraction('CreateBehaviorRecord', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    points: -5,
                    reason: 'Late night noise'
                }
            });
            
            expect(result.error).toBeUndefined();
            
            // Verify behavior record was created
            const behaviorRecord = result.effects?.[0]?.record;
            expect(behaviorRecord).toMatchObject({
                points: -5,
                reason: 'Late night noise'
            });
            
            // Verify user points were updated
            const updatedUser = await controller.system.storage.findOne('User',
                MatchExp.atom({
                    key: 'id',
                    value: ['=', student.id]
                }),
                undefined,
                ['points']
            );
            
            expect(updatedUser.points).toBe(95); // 100 - 5
            
            // Verify relations are properly established
            const userRelation = await controller.system.storage.findOneRelationByName('BehaviorRecordUserRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', behaviorRecord.id]
                }),
                undefined,
                ['*']
            );
            expect(userRelation.target.id).toBe(student.id);
            
            const recorderRelation = await controller.system.storage.findOneRelationByName('BehaviorRecordRecorderRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', behaviorRecord.id]
                }),
                undefined,
                ['*']
            );
            expect(recorderRelation.target.id).toBe(admin.id);
        });
    });
    
    describe('TC004: Request Eviction', () => {
        it('should create eviction request for user with low points', async () => {
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
                name: 'Dorm D',
                capacity: 4,
                headId: dormHead.id
            });
            
            const student = await createTestUser({
                name: 'Student',
                email: 'student@test.com'
            });
            
            // Assign user to dormitory
            await controller.callInteraction('AssignUserToDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    dormitoryId: dorm.id,
                    bedNumber: 1
                }
            });
            
            // Create behavior records to reduce points below 60
            await controller.callInteraction('CreateBehaviorRecord', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    points: -20,
                    reason: 'Violation 1'
                }
            });
            
            await controller.callInteraction('CreateBehaviorRecord', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    points: -25,
                    reason: 'Violation 2'
                }
            });
            
            // Request eviction
            const result = await controller.callInteraction('RequestEviction', {
                user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                payload: {
                    userId: student.id,
                    reason: 'Consistent rule violations'
                }
            });
            
            expect(result.error).toBeUndefined();
            
            // Verify eviction request was created
            const evictionRequest = result.effects?.[0]?.record;
            expect(evictionRequest).toMatchObject({
                reason: 'Consistent rule violations',
                status: 'pending'
            });
            
            // Verify relations are properly established
            const userRelation = await controller.system.storage.findOneRelationByName('EvictionRequestUserRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', evictionRequest.id]
                }),
                undefined,
                ['*']
            );
            expect(userRelation.target.id).toBe(student.id);
            
            const requesterRelation = await controller.system.storage.findOneRelationByName('EvictionRequestRequesterRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', evictionRequest.id]
                }),
                undefined,
                ['*']
            );
            expect(requesterRelation.target.id).toBe(dormHead.id);
        });
    });
    
    describe('TC005: Approve Eviction', () => {
        it('should approve eviction and remove user from dormitory', async () => {
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
                name: 'Dorm E',
                capacity: 4,
                headId: dormHead.id
            });
            
            const student = await createTestUser({
                name: 'Student',
                email: 'student@test.com'
            });
            
            // Assign user to dormitory
            await controller.callInteraction('AssignUserToDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    dormitoryId: dorm.id,
                    bedNumber: 1
                }
            });
            
            // Create behavior records to reduce points
            await controller.callInteraction('CreateBehaviorRecord', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    userId: student.id,
                    points: -50,
                    reason: 'Major violation'
                }
            });
            
            // Request eviction
            const evictionResult = await controller.callInteraction('RequestEviction', {
                user: { id: dormHead.id, name: 'Dorm Head', email: 'head@test.com', role: 'dormHead' },
                payload: {
                    userId: student.id,
                    reason: 'Major violation'
                }
            });
            
            const evictionRequest = evictionResult.effects?.[0]?.record;
            
            // Approve eviction
            const result = await controller.callInteraction('ApproveEviction', {
                user: { id: admin.id, name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    requestId: evictionRequest.id,
                    approved: true
                }
            });
            
            expect(result.error).toBeUndefined();
            
            // Verify eviction request status
            const updatedRequest = await controller.system.storage.findOne('EvictionRequest',
                MatchExp.atom({
                    key: 'id',
                    value: ['=', evictionRequest.id]
                }),
                undefined,
                ['*']
            );
            
            expect(updatedRequest.status).toBe('approved');
            expect(updatedRequest.approvedBy).toBe(admin.id);
            expect(updatedRequest.approvedAt).toBeDefined();
            
            // Verify user is removed from dormitory
            const userDormRelation = await controller.system.storage.findOneRelationByName('UserDormitoryRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', student.id]
                }),
                undefined,
                ['status']
            );
            
            expect(userDormRelation.status).toBe('inactive');
            
            // Verify bed is available
            const bed = await controller.system.storage.findOne('Bed',
                MatchExp.atom({
                    key: 'dormitory.id',
                    value: ['=', dorm.id]
                }).and(MatchExp.atom({
                    key: 'bedNumber',
                    value: ['=', 1]
                })),
                undefined,
                ['isOccupied']
            );
            
            expect(bed.isOccupied).toBe(false);
        });
    });
    
    describe('TC006: Assign Dorm Head', () => {
        it('should assign user as dorm head and update role', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dorm = await createTestDormitory({
                name: 'Dorm F',
                capacity: 4,
                headId: admin.id
            });
            
            const newHead = await createTestUser({
                name: 'New Head',
                email: 'newhead@test.com'
            });
            
            // Assign new dorm head
            const result = await controller.callInteraction('AssignDormHead', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: {
                    dormitoryId: dorm.id,
                    headId: newHead.id
                }
            });
            
            expect(result.error).toBeUndefined();
            
            // Verify user role was updated
            const updatedUser = await controller.system.storage.findOne('User',
                MatchExp.atom({
                    key: 'id',
                    value: ['=', newHead.id]
                }),
                undefined,
                ['role']
            );
            
            expect(updatedUser.role).toBe('dormHead');
            
            // Verify dormitory head relation
            const headRelation = await controller.system.storage.findOneRelationByName('DormitoryHeadRelation',
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', dorm.id]
                }),
                undefined,
                ['*']
            );
            
            expect(headRelation).toBeDefined();
            expect(headRelation.target.id).toBe(newHead.id);
            expect(headRelation.assignedAt).toBeDefined();
        });
    });
    
    describe('Query Interactions', () => {
        it('should get dormitory information', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dorm = await createTestDormitory({
                name: 'Test Dorm',
                capacity: 5,
                headId: admin.id
            });
            
            // Get dormitory
            const result = await controller.callInteraction('GetDormitory', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { id: dorm.id }
            });
            
            expect(result.error).toBeUndefined();
            expect(result.data).toMatchObject({
                id: dorm.id,
                name: 'Test Dorm',
                capacity: 5
            });
        });
        
        it('should list all dormitories', async () => {
            // List dormitories
            const result = await controller.callInteraction('ListDormitories', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' }
            });
            
            expect(result.error).toBeUndefined();
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeGreaterThan(0);
        });
        
        it('should get user points', async () => {
            // Create test user
            const user = await createTestUser({
                name: 'Test User',
                email: 'user@test.com'
            });
            
            // Get user points
            const result = await controller.callInteraction('GetUserPoints', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { userId: user.id }
            });
            
            expect(result.error).toBeUndefined();
            expect(result.data).toBe(100); // Default points
        });
        
        it('should get dormitory occupancy', async () => {
            // Create test data
            const admin = await createTestUser({
                name: 'Admin',
                email: 'admin@test.com'
            });
            
            const dorm = await createTestDormitory({
                name: 'Occupancy Test Dorm',
                capacity: 4,
                headId: admin.id
            });
            
            // Get occupancy
            const result = await controller.callInteraction('GetDormitoryOccupancy', {
                user: { id: 'admin', name: 'Admin', email: 'admin@test.com', role: 'admin' },
                payload: { dormitoryId: dorm.id }
            });
            
            expect(result.error).toBeUndefined();
            expect(result.data).toHaveProperty('occupancy');
            expect(result.data).toHaveProperty('availableBeds');
            expect(result.data).toHaveProperty('occupancyRate');
        });
    });
});