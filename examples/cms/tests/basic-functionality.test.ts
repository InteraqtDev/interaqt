import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Controller, MonoSystem, PGLiteDB, MatchExp
} from 'interaqt'
import { entities, relations, activities, interactions, dicts } from '../backend'

describe('Style Management System - Basic Functionality', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Setup fresh system for each test
    system = new MonoSystem(new PGLiteDB(':memory:'))
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      dicts,
      []
    )
    await controller.setup(true)
  })

  describe('Style Creation', () => {
    test('TC001: Create Style (via CreateStyle Interaction)', async () => {
      // Setup: Create a test user
      const testUser = await system.storage.create('User', {
        username: 'test_user',
        email: 'test@example.com',
        role: 'editor'
      })

      // Test based on test cases document
      const result = await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Modern Art',
          slug: 'modern-art',
          description: 'Contemporary artistic styles',
          type: 'artistic',
          thumbKey: 's3://bucket/modern-art-thumb.jpg',
          priority: 10
        }
      })

      expect(result.error).toBeUndefined()

      // Verify style was created with correct properties
      const style = await system.storage.findOne('Style', MatchExp.atom({
        key: 'slug',
        value: ['=', 'modern-art']
      }), undefined, ['id', 'label', 'slug', 'description', 'type', 'thumbKey', 'priority', 'status', 'createdAt', 'updatedAt'])

      expect(style).toBeDefined()
      expect(style.label).toBe('Modern Art')
      expect(style.slug).toBe('modern-art')
      expect(style.description).toBe('Contemporary artistic styles')
      expect(style.type).toBe('artistic')
      expect(style.thumbKey).toBe('s3://bucket/modern-art-thumb.jpg')
      expect(style.priority).toBe(10)
      expect(style.status).toBe('draft')
      expect(style.createdAt).toBeDefined()
      expect(style.updatedAt).toBeDefined()
    })

    test('TC002: Create Style with Invalid Data (via CreateStyle Interaction)', async () => {
      // Setup: Create a test user
      const testUser = await system.storage.create('User', {
        username: 'test_user2',
        email: 'test2@example.com',
        role: 'editor'
      })

      // Test validation failure
      const result = await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: '',
          slug: '',
          description: '',
          type: '',
          thumbKey: '',
          priority: -1
        }
      })

      // Should fail due to validation
      expect(result.error).toBeDefined()
      expect(result.error.type).toBe('payload label missing')
    })
  })

  describe('Style Updates', () => {
    test('TC004: Update Style (via UpdateStyle Interaction)', async () => {
      // Setup: Create a test user
      const testUser = await system.storage.create('User', {
        username: 'test_user3',
        email: 'test3@example.com',
        role: 'editor'
      })

      // First create a style
      const createResult = await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Original Art',
          slug: 'original-art',
          description: 'Original description',
          type: 'artistic',
          thumbKey: 's3://bucket/original.jpg',
          priority: 5
        }
      })

      expect(createResult.error).toBeUndefined()

      // Get the created style to find its ID
      const createdStyle = await system.storage.findOne('Style', MatchExp.atom({
        key: 'slug',
        value: ['=', 'original-art']
      }), undefined, ['id'])

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      // Update the style
      const updateResult = await controller.callInteraction('UpdateStyle', {
        user: testUser,
        payload: {
          styleId: createdStyle.id,
          label: 'Updated Modern Art',
          description: 'Updated description',
          priority: 15
        }
      })

      expect(updateResult.error).toBeUndefined()

      // Verify updates were applied
      const updatedStyle = await system.storage.findOne('Style', MatchExp.atom({
        key: 'id',
        value: ['=', createdStyle.id]
      }), undefined, ['id', 'label', 'slug', 'description', 'type', 'thumbKey', 'priority', 'status', 'createdAt', 'updatedAt'])

      expect(updatedStyle.label).toBe('Updated Modern Art')
      expect(updatedStyle.description).toBe('Updated description')
      expect(updatedStyle.priority).toBe(15)
      expect(updatedStyle.slug).toBe('original-art') // Unchanged
      expect(updatedStyle.type).toBe('artistic') // Unchanged
      expect(updatedStyle.thumbKey).toBe('s3://bucket/original.jpg') // Unchanged
      expect(updatedStyle.status).toBe('draft') // Unchanged
    })
  })

  describe('Style Reordering', () => {
    test('TC009: Reorder Styles (via ReorderStyles Interaction)', async () => {
      // Setup: Create a test user
      const testUser = await system.storage.create('User', {
        username: 'test_user4',
        email: 'test4@example.com',
        role: 'editor'
      })

      // Create multiple styles
      await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Style 1',
          slug: 'style-1',
          description: 'First style',
          type: 'type1',
          priority: 10
        }
      })

      await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Style 2',
          slug: 'style-2', 
          description: 'Second style',
          type: 'type2',
          priority: 20
        }
      })

      await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Style 3',
          slug: 'style-3',
          description: 'Third style', 
          type: 'type3',
          priority: 30
        }
      })

      // Get the created styles to find their IDs
      const style1 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'slug',
        value: ['=', 'style-1']
      }), undefined, ['id'])
      
      const style2 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'slug',
        value: ['=', 'style-2']
      }), undefined, ['id'])
      
      const style3 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'slug',
        value: ['=', 'style-3']
      }), undefined, ['id'])

      // Reorder the styles
      const reorderResult = await controller.callInteraction('ReorderStyles', {
        user: testUser,
        payload: {
          styleUpdates: [
            { styleId: style1.id, priority: 3 },
            { styleId: style2.id, priority: 1 },
            { styleId: style3.id, priority: 2 }
          ]
        }
      })

      expect(reorderResult.error).toBeUndefined()

      // Verify new priorities
      const updatedStyle1 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'id',
        value: ['=', style1.id]
      }), undefined, ['priority'])
      
      const updatedStyle2 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'id',
        value: ['=', style2.id]
      }), undefined, ['priority'])
      
      const updatedStyle3 = await system.storage.findOne('Style', MatchExp.atom({
        key: 'id',
        value: ['=', style3.id]
      }), undefined, ['priority'])

      expect(updatedStyle1.priority).toBe(3)
      expect(updatedStyle2.priority).toBe(1)
      expect(updatedStyle3.priority).toBe(2)
    })
  })

  describe('Version Management', () => {
    test('TC012: Create Version (via CreateVersion Interaction)', async () => {
      // Setup: Create an admin user
      const adminUser = await system.storage.create('User', {
        username: 'admin_user',
        email: 'admin@example.com',
        role: 'admin'
      })

      const result = await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          versionName: 'v2.1.0',
          description: 'Added new artistic styles and updated priorities',
          snapshot: JSON.stringify([]) // Empty snapshot for testing
        }
      })

      expect(result.error).toBeUndefined()

      // Verify version was created
      const version = await system.storage.findOne('Version', MatchExp.atom({
        key: 'versionName',
        value: ['=', 'v2.1.0']
      }), undefined, ['id', 'versionName', 'description', 'createdAt', 'isPublished', 'isCurrent'])

      expect(version).toBeDefined()
      expect(version.versionName).toBe('v2.1.0')
      expect(version.description).toBe('Added new artistic styles and updated priorities')
      expect(version.isPublished).toBe(false)
      expect(version.isCurrent).toBe(false)
      expect(version.createdAt).toBeDefined()
    })

    test('TC013: Publish Version (via PublishVersion Interaction)', async () => {
      // Setup: Create an admin user
      const adminUser = await system.storage.create('User', {
        username: 'admin_user2',
        email: 'admin2@example.com',
        role: 'admin'
      })

      // First create a version
      const createResult = await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          versionName: 'v1.0.0',
          description: 'Initial version'
        }
      })

      expect(createResult.error).toBeUndefined()

      // Get the created version to find its ID
      const createdVersion = await system.storage.findOne('Version', MatchExp.atom({
        key: 'versionName',
        value: ['=', 'v1.0.0']
      }), undefined, ['id'])

      // Publish the version
      const publishResult = await controller.callInteraction('PublishVersion', {
        user: adminUser,
        payload: {
          versionId: createdVersion.id
        }
      })

      expect(publishResult.error).toBeUndefined()

      // Verify version was published
      const publishedVersion = await system.storage.findOne('Version', MatchExp.atom({
        key: 'id',
        value: ['=', createdVersion.id]
      }), undefined, ['id', 'isPublished', 'isCurrent', 'publishedAt'])

      expect(publishedVersion.isPublished).toBe(true)
      expect(publishedVersion.isCurrent).toBe(true)
      expect(publishedVersion.publishedAt).toBeDefined()
    })
  })

  describe('User Statistics', () => {
    test('User created style count should update automatically', async () => {
      // Setup: Create a test user
      const testUser = await system.storage.create('User', {
        username: 'test_user5',
        email: 'test5@example.com',
        role: 'editor'
      })

      // Create styles for this user
      await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Test Style 1',
          slug: 'test-style-1',
          description: 'Test',
          type: 'test'
        }
      })

      await controller.callInteraction('CreateStyle', {
        user: testUser,
        payload: {
          label: 'Test Style 2',
          slug: 'test-style-2',
          description: 'Test',
          type: 'test'
        }
      })

      // Check that user style count is automatically computed
      const user = await system.storage.findOne('User', MatchExp.atom({
        key: 'id',
        value: ['=', testUser.id]
      }), undefined, ['id', 'createdStyleCount'])

      expect(user).toBeDefined()
      expect(user.createdStyleCount).toBe(2)
    })
  })
})