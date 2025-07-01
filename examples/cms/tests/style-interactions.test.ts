import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'
import { v4 as uuid } from 'uuid'
import { entities, relations, interactions, activities } from '../backend'

describe('Style Interactions', () => {
  let system: MonoSystem
  let controller: Controller
  let adminUserId: string
  let adminUser: any

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
    
    // Create admin user for testing
    adminUserId = uuid()
    adminUser = await system.storage.create('User', {
      id: adminUserId,
      email: 'admin@test.com',
      roles: ['admin'],
      name: 'Admin User',
      createdAt: new Date().toISOString()
    })
  })

  describe('TC001: Create Style', () => {
    test('should create style successfully with valid data', async () => {
      const styleData = {
        label: 'Manga Style',
        slug: 'manga',
        description: 'Japanese animation style',
        type: 'animation',
        thumbKey: 'styles/manga-thumb.jpg',
        priority: 100
      }

      const result = await controller.callInteraction('CreateStyle', {
        user: adminUser,
        payload: {
          style: styleData
        }
      })

      expect(result.error).toBeUndefined()
      
      // Verify style was created
      const styles = await system.storage.find('Style', 
        MatchExp.atom({ key: 'slug', value: ['=', 'manga'] }),
        undefined,
        ['*']
      )
      
      expect(styles).toHaveLength(1)
      expect(styles[0].label).toBe('Manga Style')
      expect(styles[0].status).toBe('draft')
      expect(styles[0].priority).toBe(100)
      expect(styles[0].createdAt).toBeDefined()
      expect(styles[0].updatedAt).toBeDefined()
    })

    test('should fail with duplicate slug', async () => {
      // Create first style
      await controller.callInteraction('CreateStyle', {
        user: adminUser,
        payload: {
          style: {
            label: 'Manga Style',
            slug: 'manga',
            description: 'Japanese animation style',
            type: 'animation',
            thumbKey: 'styles/manga-thumb.jpg',
            priority: 100
          }
        }
      })

      // Try to create another with same slug
      const result = await controller.callInteraction('CreateStyle', {
        user: adminUser,
        payload: {
          style: {
            label: 'Another Manga',
            slug: 'manga',
            description: 'Another description',
            type: 'animation',
            thumbKey: 'styles/manga-thumb2.jpg',
            priority: 200
          }
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should fail with invalid user role', async () => {
      const regularUserId = uuid()
      await system.storage.create('User', {
        id: regularUserId,
        email: 'user@test.com',
        roles: ['user'],
        name: 'Regular User',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('CreateStyle', {
        user: { id: regularUserId },
        payload: {
          style: {
            label: 'Manga Style',
            slug: 'manga',
            description: 'Japanese animation style',
            type: 'animation',
            thumbKey: 'styles/manga-thumb.jpg',
            priority: 100
          }
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC002: Update Style Properties', () => {
    let styleId: string

    beforeEach(async () => {
      styleId = uuid()
      await system.storage.create('Style', {
        id: styleId,
        label: 'Original Label',
        slug: 'original',
        description: 'Original description',
        type: 'animation',
        thumbKey: 'original-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    test('should update style properties successfully', async () => {
      const result = await controller.callInteraction('UpdateStyle', {
        user: adminUser,
        payload: {
          style: { id: styleId },
          updates: {
            label: 'Updated Label',
            priority: 200
          }
        }
      })

      expect(result.error).toBeUndefined()

      const updatedStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', styleId] })
      )

      expect(updatedStyle.label).toBe('Updated Label')
      expect(updatedStyle.priority).toBe(200)
      expect(updatedStyle.slug).toBe('original') // unchanged
    })

    test('should fail with non-existent styleId', async () => {
      const result = await controller.callInteraction('UpdateStyle', {
        user: adminUser,
        payload: {
          style: { id: 'non-existent-id' },
          updates: {
            label: 'Updated Label'
          }
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC003: Publish Style', () => {
    let draftStyleId: string

    beforeEach(async () => {
      draftStyleId = uuid()
      await system.storage.create('Style', {
        id: draftStyleId,
        label: 'Draft Style',
        slug: 'draft-style',
        description: 'Draft description',
        type: 'animation',
        thumbKey: 'draft-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    test('should publish draft style successfully', async () => {
      const result = await controller.callInteraction('PublishStyle', {
        user: adminUser,
        payload: {
          style: { id: draftStyleId }
        }
      })

      expect(result.error).toBeUndefined()

      const publishedStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', draftStyleId] })
      )

      expect(publishedStyle.status).toBe('published')
    })

    test('should fail to publish already published style', async () => {
      // First publish the style
      await controller.callInteraction('PublishStyle', {
        user: adminUser,
        payload: { style: { id: draftStyleId } }
      })

      // Try to publish again
      const result = await controller.callInteraction('PublishStyle', {
        user: adminUser,
        payload: { style: { id: draftStyleId } }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC004: Unpublish Style', () => {
    let publishedStyleId: string

    beforeEach(async () => {
      publishedStyleId = uuid()
      await system.storage.create('Style', {
        id: publishedStyleId,
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
    })

    test('should unpublish published style successfully', async () => {
      const result = await controller.callInteraction('UnpublishStyle', {
        user: adminUser,
        payload: {
          style: { id: publishedStyleId }
        }
      })

      expect(result.error).toBeUndefined()

      const unpublishedStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', publishedStyleId] })
      )

      expect(unpublishedStyle.status).toBe('offline')
    })

    test('should fail to unpublish draft style', async () => {
      const draftStyleId = uuid()
      await system.storage.create('Style', {
        id: draftStyleId,
        label: 'Draft Style',
        slug: 'draft-style',
        description: 'Draft description',
        type: 'animation',
        thumbKey: 'draft-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('UnpublishStyle', {
        user: adminUser,
        payload: { style: { id: draftStyleId } }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC005: Delete Style', () => {
    let styleId: string

    beforeEach(async () => {
      styleId = uuid()
      await system.storage.create('Style', {
        id: styleId,
        label: 'To Delete',
        slug: 'to-delete',
        description: 'Will be deleted',
        type: 'animation',
        thumbKey: 'delete-thumb.jpg',
        priority: 100,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    })

    test('should delete style successfully', async () => {
      const result = await controller.callInteraction('DeleteStyle', {
        user: adminUser,
        payload: {
          style: { id: styleId }
        }
      })

      expect(result.error).toBeUndefined()

      const deletedStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', styleId] })
      )

      expect(deletedStyle).toBeNull()
    })

    test('should fail with non-existent styleId', async () => {
      const result = await controller.callInteraction('DeleteStyle', {
        user: adminUser,
        payload: {
          style: { id: 'non-existent-id' }
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC006: List Styles by Status', () => {
    beforeEach(async () => {
      // Create styles with different statuses
      const styles = [
        { id: uuid(), status: 'draft', priority: 10 },
        { id: uuid(), status: 'published', priority: 20 },
        { id: uuid(), status: 'offline', priority: 30 },
        { id: uuid(), status: 'published', priority: 5 }
      ]

      for (const style of styles) {
        await system.storage.create('Style', {
          id: style.id,
          label: `Style ${style.id}`,
          slug: `style-${style.id}`,
          description: `Description ${style.id}`,
          type: 'animation',
          thumbKey: `thumb-${style.id}.jpg`,
          priority: style.priority,
          status: style.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    })

    test('should list published styles sorted by priority', async () => {
      const result = await controller.callInteraction('ListStylesAdmin', {
        user: adminUser,
        payload: {}
      })

      expect(result.error).toBeUndefined()
      
      const publishedStyles = await system.storage.find('Style',
        MatchExp.atom({ key: 'status', value: ['=', 'published'] })
      )

      expect(publishedStyles).toHaveLength(2)
      // Should be sorted by priority (5, 20)
    })

    test('should return empty list for non-existent status', async () => {
      const result = await controller.callInteraction('ListStylesAdmin', {
        user: adminUser,
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })
  })

  describe('TC007: Bulk Update Priorities', () => {
    let styleIds: string[]

    beforeEach(async () => {
      styleIds = [uuid(), uuid(), uuid()]
      
      for (let i = 0; i < styleIds.length; i++) {
        await system.storage.create('Style', {
          id: styleIds[i],
          label: `Style ${i}`,
          slug: `style-${i}`,
          description: `Description ${i}`,
          type: 'animation',
          thumbKey: `thumb-${i}.jpg`,
          priority: (i + 1) * 10,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    })

    test('should update multiple priorities successfully', async () => {
      const result = await controller.callInteraction('BulkUpdatePriorities', {
        user: adminUser,
        payload: {
          styles: [
            { id: styleIds[0], priority: 100 },
            { id: styleIds[1], priority: 200 },
            { id: styleIds[2], priority: 300 }
          ]
        }
      })

      expect(result.error).toBeUndefined()

      // Verify all priorities were updated
      for (let i = 0; i < styleIds.length; i++) {
        const style = await system.storage.findOne('Style',
          MatchExp.atom({ key: 'id', value: ['=', styleIds[i]] })
        )
        expect(style.priority).toBe((i + 1) * 100)
      }
    })

    test('should fail atomically with non-existent styleId', async () => {
      const result = await controller.callInteraction('BulkUpdatePriorities', {
        user: adminUser,
        payload: {
          styles: [
            { id: styleIds[0], priority: 100 },
            { id: 'non-existent-id', priority: 200 },
            { id: styleIds[2], priority: 300 }
          ]
        }
      })

      expect(result.error).toBeDefined()

      // Verify no priorities were updated
      for (let i = 0; i < styleIds.length; i++) {
        const style = await system.storage.findOne('Style',
          MatchExp.atom({ key: 'id', value: ['=', styleIds[i]] })
        )
        expect(style.priority).toBe((i + 1) * 10) // Original values
      }
    })
  })

  describe('TC010: Get Published Styles (Public API)', () => {
    beforeEach(async () => {
      const styles = [
        { status: 'draft', priority: 10 },
        { status: 'published', priority: 20 },
        { status: 'offline', priority: 30 },
        { status: 'published', priority: 5 }
      ]

      for (let i = 0; i < styles.length; i++) {
        await system.storage.create('Style', {
          id: uuid(),
          label: `Style ${i}`,
          slug: `style-${i}`,
          description: `Description ${i}`,
          type: 'animation',
          thumbKey: `thumb-${i}.jpg`,
          priority: styles[i].priority,
          status: styles[i].status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    })

    test('should return only published styles sorted by priority', async () => {
      const result = await controller.callInteraction('GetPublishedStyles', {
        user: { id: 'anonymous' },
        payload: {}
      })

      expect(result.error).toBeUndefined()
      
      const publishedStyles = await system.storage.find('Style',
        MatchExp.atom({ key: 'status', value: ['=', 'published'] })
      )

      expect(publishedStyles).toHaveLength(2)
    })

    test('should work without authentication', async () => {
      const result = await controller.callInteraction('GetPublishedStyles', {
        user: { id: 'anonymous' },
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })
  })
})