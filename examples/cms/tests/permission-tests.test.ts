import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'
import { v4 as uuid } from 'uuid'
import { entities, relations, interactions, activities } from '../backend'

describe('Permission and Security Tests', () => {
  let system: MonoSystem
  let controller: Controller
  let adminUserId: string
  let adminUser: any
  let regularUserId: string

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
    
    // Create admin user
    adminUserId = uuid()
    adminUser = await system.storage.create('User', {
      id: adminUserId,
      email: 'admin@test.com',
      roles: ['admin'],
      name: 'Admin User',
      createdAt: new Date().toISOString()
    })

    // Create regular user
    regularUserId = uuid()
    await system.storage.create('User', {
      id: regularUserId,
      email: 'user@test.com',
      roles: ['user'],
      name: 'Regular User',
      createdAt: new Date().toISOString()
    })
  })

  describe('TC011: Invalid Authentication', () => {
    test('should reject requests with invalid user ID', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        user: { id: 'invalid-user-id' },
        payload: {
          label: 'Test Style',
          slug: 'test-style',
          description: 'Test description',
          type: 'animation',
          thumbKey: 'test-thumb.jpg',
          priority: 100
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should handle missing user object gracefully', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        user: null as any,
        payload: {
          label: 'Test Style',
          slug: 'test-style',
          description: 'Test description',
          type: 'animation',
          thumbKey: 'test-thumb.jpg',
          priority: 100
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should handle undefined user gracefully', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        user: undefined as any,
        payload: {
          label: 'Test Style',
          slug: 'test-style',
          description: 'Test description',
          type: 'animation',
          thumbKey: 'test-thumb.jpg',
          priority: 100
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC012: Unauthorized Access', () => {
    test('should deny regular user access to admin operations', async () => {
      const adminOperations = [
        {
          interaction: 'CreateStyle',
          payload: {
            label: 'Test Style',
            slug: 'test-style',
            description: 'Test description',
            type: 'animation',
            thumbKey: 'test-thumb.jpg',
            priority: 100
          }
        },
        {
          interaction: 'UpdateStyle',
          payload: {
            styleId: uuid(),
            label: 'Updated Style'
          }
        },
        {
          interaction: 'DeleteStyle',
          payload: {
            styleId: uuid()
          }
        },
        {
          interaction: 'PublishStyle',
          payload: {
            styleId: uuid()
          }
        },
        {
          interaction: 'UnpublishStyle',
          payload: {
            styleId: uuid()
          }
        },
        {
          interaction: 'BulkUpdatePriorities',
          payload: {
            updates: JSON.stringify([])
          }
        },
        {
          interaction: 'CreateVersion',
          payload: {
            name: 'Test Version',
            description: 'Test description',
            snapshot: JSON.stringify({ styles: [] })
          }
        },
        {
          interaction: 'ListVersions',
          payload: {}
        },
        {
          interaction: 'RollbackToVersion',
          payload: {
            versionId: uuid()
          }
        },
        {
          interaction: 'DeleteVersion',
          payload: {
            versionId: uuid()
          }
        }
      ]

      for (const operation of adminOperations) {
        const result = await controller.callInteraction(operation.interaction, {
          user: { id: regularUserId },
          payload: operation.payload
        })

        expect(result.error).toBeDefined()
      }
    })

    test('should allow public access to GetPublishedStyles', async () => {
      // Create a published style first
      await system.storage.create('Style', {
        id: uuid(),
        label: 'Published Style',
        slug: 'published-style',
        description: 'Published description',
        type: 'animation',
        thumbKey: 'published-thumb.jpg',
        priority: 100,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('GetPublishedStyles', {
        user: { id: 'anonymous' },
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })

    test('should deny unknown roles access to admin operations', async () => {
      const unknownUserId = uuid()
      await system.storage.create('User', {
        id: unknownUserId,
        email: 'unknown@test.com',
        roles: ['unknown'],
        name: 'Unknown User',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('CreateStyle', {
        user: { id: unknownUserId },
        payload: {
          label: 'Test Style',
          slug: 'test-style',
          description: 'Test description',
          type: 'animation',
          thumbKey: 'test-thumb.jpg',
          priority: 100
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC013: Concurrent Style Updates', () => {
    let styleId: string

    beforeEach(async () => {
      styleId = uuid()
      await system.storage.create('Style', {
        id: styleId,
        label: 'Concurrent Test Style',
        slug: 'concurrent-test',
        description: 'For concurrent testing',
        type: 'animation',
        thumbKey: 'concurrent-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    test('should handle concurrent updates gracefully', async () => {
      // Simulate concurrent updates
      const update1Promise = controller.callInteraction('UpdateStyle', {
        user: adminUser,
        payload: {
          styleId,
          label: 'Updated by Admin 1',
          priority: 200
        }
      })

      const update2Promise = controller.callInteraction('UpdateStyle', {
        user: adminUser,
        payload: {
          styleId,
          label: 'Updated by Admin 2',
          priority: 300
        }
      })

      const [result1, result2] = await Promise.all([update1Promise, update2Promise])

      // At least one should succeed
      const successfulUpdates = [result1, result2].filter(r => !r.error)
      expect(successfulUpdates.length).toBeGreaterThanOrEqual(1)

      // Final state should be consistent
      const finalStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', styleId] })
      )
      expect(finalStyle).toBeDefined()
      expect(finalStyle.updatedAt).toBeDefined()
    })

    test('should maintain data consistency under concurrent load', async () => {
      // Create multiple concurrent operations
      const operations = []
      
      for (let i = 0; i < 5; i++) {
        operations.push(
          controller.callInteraction('UpdateStyle', {
            user: adminUser,
            payload: {
              styleId,
              priority: 100 + i
            }
          })
        )
      }

      const results = await Promise.all(operations)

      // Verify system remains stable
      const finalStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', styleId] })
      )
      
      expect(finalStyle).toBeDefined()
      expect(finalStyle.id).toBe(styleId)
      expect(typeof finalStyle.priority).toBe('number')
    })
  })

  describe('TC014: Slug Uniqueness Validation', () => {
    beforeEach(async () => {
      // Create style with 'manga' slug
      await system.storage.create('Style', {
        id: uuid(),
        label: 'Manga Style',
        slug: 'manga',
        description: 'Japanese animation style',
        type: 'animation',
        thumbKey: 'manga-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    test('should enforce slug uniqueness on creation', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        user: adminUser,
        payload: {
          label: 'Another Manga',
          slug: 'manga',
          description: 'Another manga style',
          type: 'animation',
          thumbKey: 'another-manga-thumb.jpg',
          priority: 200
        }
      })

      expect(result.error).toBeDefined()

      // Verify only one 'manga' slug exists
      const mangaStyles = await system.storage.find('Style',
        MatchExp.atom({ key: 'slug', value: ['=', 'manga'] })
      )
      expect(mangaStyles).toHaveLength(1)
    })

    test('should enforce case-insensitive slug uniqueness', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        user: adminUser,
        payload: {
          label: 'Manga Uppercase',
          slug: 'MANGA',
          description: 'Uppercase manga slug',
          type: 'animation',
          thumbKey: 'manga-upper-thumb.jpg',
          priority: 200
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should handle special characters in slug validation', async () => {
      const testSlugs = ['manga-style', 'manga_style', 'manga123']
      
      for (const slug of testSlugs) {
        const result = await controller.callInteraction('CreateStyle', {
          user: adminUser,
          payload: {
            label: `Style ${slug}`,
            slug: slug,
            description: `Style with ${slug} slug`,
            type: 'animation',
            thumbKey: `${slug}-thumb.jpg`,
            priority: 100
          }
        })

        expect(result.error).toBeUndefined()
      }
    })
  })

  describe('TC015: Bulk Operation Failure Recovery', () => {
    let validStyleIds: string[]

    beforeEach(async () => {
      validStyleIds = [uuid(), uuid(), uuid()]
      
      for (let i = 0; i < validStyleIds.length; i++) {
        await system.storage.create('Style', {
          id: validStyleIds[i],
          label: `Bulk Test Style ${i}`,
          slug: `bulk-test-${i}`,
          description: `Bulk test description ${i}`,
          type: 'animation',
          thumbKey: `bulk-test-${i}-thumb.jpg`,
          priority: (i + 1) * 10,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    })

    test('should rollback all changes on any failure in bulk update', async () => {
      // Store original priorities
      const originalStyles = []
      for (const styleId of validStyleIds) {
        const style = await system.storage.findOne('Style',
          MatchExp.atom({ key: 'id', value: ['=', styleId] })
        )
        originalStyles.push({ id: styleId, priority: style.priority })
      }

      // Attempt bulk update with one invalid ID
      const updates = JSON.stringify([
        { styleId: validStyleIds[0], priority: 100 },
        { styleId: 'invalid-style-id', priority: 200 },
        { styleId: validStyleIds[2], priority: 300 }
      ])

      const result = await controller.callInteraction('BulkUpdatePriorities', {
        user: adminUser,
        payload: { updates }
      })

      expect(result.error).toBeDefined()

      // Verify all styles maintain original priorities
      for (const original of originalStyles) {
        const currentStyle = await system.storage.findOne('Style',
          MatchExp.atom({ key: 'id', value: ['=', original.id] })
        )
        expect(currentStyle.priority).toBe(original.priority)
      }
    })

    test('should handle database constraint violations gracefully', async () => {
      // Try to update with invalid priority values
      const updates = JSON.stringify([
        { styleId: validStyleIds[0], priority: -1 },
        { styleId: validStyleIds[1], priority: 'invalid' as any },
        { styleId: validStyleIds[2], priority: null as any }
      ])

      const result = await controller.callInteraction('BulkUpdatePriorities', {
        user: adminUser,
        payload: { updates }
      })

      expect(result.error).toBeDefined()

      // Verify system remains stable
      const styles = await system.storage.find('Style', {})
      expect(styles.length).toBeGreaterThanOrEqual(3)
    })

    test('should maintain referential integrity on bulk failures', async () => {
      // Create relations that might be affected
      await system.storage.create('UserStyleRelation', {
        source: adminUserId,
        target: validStyleIds[0]
      })

      // Attempt operation that might affect relations
      const updates = JSON.stringify([
        { styleId: validStyleIds[0], priority: 100 },
        { styleId: 'non-existent-id', priority: 200 }
      ])

      const result = await controller.callInteraction('BulkUpdatePriorities', {
        user: adminUser,
        payload: { updates }
      })

      expect(result.error).toBeDefined()

      // Verify relations are intact
      const relations = await system.storage.find('UserStyleRelation',
        MatchExp.atom({ key: 'source', value: ['=', adminUserId] })
      )
      expect(relations.length).toBeGreaterThanOrEqual(1)
    })
  })
})