import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'
import { v4 as uuid } from 'uuid'

describe('User Interactions', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName

    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    )

    await controller.setup(true)
  })

  test('Create User - Success', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    const result = await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        role: 'editor',
        isActive: true,
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify user creation
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData).toBeDefined()
    expect(userData.username).toBe('testuser')
    expect(userData.email).toBe('test@example.com')
    expect(userData.role).toBe('editor')
    expect(userData.isActive).toBe(true)
    expect(userData.styleCount).toBe(0)
    expect(userData.versionCount).toBe(0)
  })

  test('Create User with default values', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    const result = await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'defaultuser',
        email: 'default@example.com',
        role: 'viewer',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.isActive).toBe(true) // Should use default value
    expect(userData.role).toBe('viewer')
  })

  test('Update User - Success', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Create user first
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'originaluser',
        email: 'original@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Update user
    const result = await controller.run({
      name: 'UpdateUser',
      payload: {
        userId: userId,
        username: 'updateduser',
        email: 'updated@example.com',
        role: 'admin',
        isActive: false
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify update
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.username).toBe('updateduser')
    expect(userData.email).toBe('updated@example.com')
    expect(userData.role).toBe('admin')
    expect(userData.isActive).toBe(false)
  })

  test('Update User - Partial update', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Create user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Update only username
    const result = await controller.run({
      name: 'UpdateUser',
      payload: {
        userId: userId,
        username: 'newusername'
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify only username changed
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.username).toBe('newusername')
    expect(userData.email).toBe('test@example.com') // Should remain unchanged
    expect(userData.role).toBe('editor') // Should remain unchanged
  })

  test('Delete User - Success', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Create user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'deleteuser',
        email: 'delete@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Delete user
    const result = await controller.run({
      name: 'DeleteUser',
      payload: {
        userId: userId
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify deletion
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData).toBeNull()
  })

  test('Get User List - Success', async () => {
    const user1Id = uuid()
    const user2Id = uuid()
    const user3Id = uuid()
    const now = new Date().toISOString()

    // Create multiple users
    const users = [
      { id: user1Id, username: 'admin1', email: 'admin1@example.com', role: 'admin' },
      { id: user2Id, username: 'editor1', email: 'editor1@example.com', role: 'editor' },
      { id: user3Id, username: 'viewer1', email: 'viewer1@example.com', role: 'viewer' }
    ]

    for (const user of users) {
      await controller.run({
        name: 'CreateUser',
        payload: {
          ...user,
          createdAt: now
        },
        user: { id: 'system', role: 'admin' }
      })
    }

    // Get user list
    const result = await controller.run({
      name: 'GetUserList',
      payload: {
        filter: {},
        page: 1,
        limit: 10
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()
    // Note: Actual filtering and pagination would be implemented in the query handler
  })

  test('Get User List - With filter', async () => {
    const user1Id = uuid()
    const user2Id = uuid()
    const now = new Date().toISOString()

    // Create users with different roles
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: user1Id,
        username: 'admin1',
        email: 'admin1@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: user2Id,
        username: 'editor1',
        email: 'editor1@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Get users filtered by role
    const result = await controller.run({
      name: 'GetUserList',
      payload: {
        filter: {
          role: 'admin'
        },
        page: 1,
        limit: 10
      },
      user: { id: 'system', role: 'admin' }
    })

    expect(result.error).toBeUndefined()
    // Result should contain only admin users
  })

  test('Get Current User - Success', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Create user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'currentuser',
        email: 'current@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Get current user
    const result = await controller.run({
      name: 'GetCurrentUser',
      payload: {},
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()
    // Should return the current user's information
  })

  test('Update Profile - Success', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Create user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'profileuser',
        email: 'profile@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Update profile
    const result = await controller.run({
      name: 'UpdateProfile',
      payload: {
        username: 'newprofileuser',
        email: 'newprofile@example.com'
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify profile update
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.username).toBe('newprofileuser')
    expect(userData.email).toBe('newprofile@example.com')
    expect(userData.role).toBe('editor') // Role should remain unchanged
  })

  test('TC011: Admin permissions - Full access', async () => {
    const adminId = uuid()
    const targetUserId = uuid()
    const now = new Date().toISOString()

    // Create admin user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: adminId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Admin should be able to create other users
    const createResult = await controller.run({
      name: 'CreateUser',
      payload: {
        id: targetUserId,
        username: 'targetuser',
        email: 'target@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(createResult.error).toBeUndefined()

    // Admin should be able to update other users
    const updateResult = await controller.run({
      name: 'UpdateUser',
      payload: {
        userId: targetUserId,
        role: 'viewer'
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(updateResult.error).toBeUndefined()

    // Admin should be able to delete other users
    const deleteResult = await controller.run({
      name: 'DeleteUser',
      payload: {
        userId: targetUserId
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(deleteResult.error).toBeUndefined()

    // Admin should be able to get user list
    const listResult = await controller.run({
      name: 'GetUserList',
      payload: {},
      user: { id: adminId, role: 'admin' }
    })

    expect(listResult.error).toBeUndefined()
  })

  test('TC012: Editor permissions - Limited access', async () => {
    const editorId = uuid()
    const otherUserId = uuid()
    const now = new Date().toISOString()

    // Create editor user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editorId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Create another user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: otherUserId,
        username: 'otheruser',
        email: 'other@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Editor should NOT be able to create users
    const createResult = await controller.run({
      name: 'CreateUser',
      payload: {
        id: uuid(),
        username: 'newuser',
        email: 'new@example.com',
        role: 'viewer',
        createdAt: now
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(createResult.error).toBeDefined()

    // Editor should NOT be able to update other users
    const updateResult = await controller.run({
      name: 'UpdateUser',
      payload: {
        userId: otherUserId,
        role: 'admin'
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(updateResult.error).toBeDefined()

    // Editor should NOT be able to delete other users
    const deleteResult = await controller.run({
      name: 'DeleteUser',
      payload: {
        userId: otherUserId
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(deleteResult.error).toBeDefined()

    // Editor should NOT be able to get user list
    const listResult = await controller.run({
      name: 'GetUserList',
      payload: {},
      user: { id: editorId, role: 'editor' }
    })

    expect(listResult.error).toBeDefined()

    // Editor should be able to update their own profile
    const profileResult = await controller.run({
      name: 'UpdateProfile',
      payload: {
        username: 'updatededitor'
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(profileResult.error).toBeUndefined()

    // Editor should be able to get their own info
    const currentUserResult = await controller.run({
      name: 'GetCurrentUser',
      payload: {},
      user: { id: editorId, role: 'editor' }
    })

    expect(currentUserResult.error).toBeUndefined()
  })

  test('TC013: Viewer permissions - Read-only access', async () => {
    const viewerId = uuid()
    const now = new Date().toISOString()

    // Create viewer user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: viewerId,
        username: 'viewer',
        email: 'viewer@example.com',
        role: 'viewer',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Viewer should NOT be able to create users
    const createResult = await controller.run({
      name: 'CreateUser',
      payload: {
        id: uuid(),
        username: 'newuser',
        email: 'new@example.com',
        role: 'viewer',
        createdAt: now
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(createResult.error).toBeDefined()

    // Viewer should be able to update their own profile
    const profileResult = await controller.run({
      name: 'UpdateProfile',
      payload: {
        username: 'updatedviewer'
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(profileResult.error).toBeUndefined()

    // Viewer should be able to get their own info
    const currentUserResult = await controller.run({
      name: 'GetCurrentUser',
      payload: {},
      user: { id: viewerId, role: 'viewer' }
    })

    expect(currentUserResult.error).toBeUndefined()
  })

  test('Computed properties - User counts', async () => {
    const userId = uuid()
    const styleId = uuid()
    const versionId = uuid()
    const now = new Date().toISOString()

    // Create user
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Initial counts should be 0
    let userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.styleCount).toBe(0)
    expect(userData.versionCount).toBe(0)

    // Create a style - should increment styleCount
    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Test Style',
        slug: 'test-style',
        description: 'Test description',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.styleCount).toBe(1)

    // Create a version - should increment versionCount
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Test Version',
        description: 'Test version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.versionCount).toBe(1)

    // Delete style - should decrement styleCount
    await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: styleId
      },
      user: { id: userId, role: 'editor' }
    })

    userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.styleCount).toBe(0)
  })
})