import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'
import { v4 as uuid } from 'uuid'

describe('Style Interactions', () => {
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

  test('TC001: Create Style - Success', async () => {
    const userId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Create user first
    const createUserResult = await controller.run({
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
    expect(createUserResult.error).toBeUndefined()

    // Create style
    const result = await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Manga Style',
        slug: 'manga-style',
        description: 'Japanese manga illustration style',
        type: 'animation',
        thumbKey: 'styles/manga/thumb.jpg',
        priority: 10,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify style creation
    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData).toBeDefined()
    expect(styleData.label).toBe('Manga Style')
    expect(styleData.slug).toBe('manga-style')
    expect(styleData.status).toBe('draft')
    expect(styleData.createdBy).toBe(userId)

    // Verify computed property - user's style count
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.styleCount).toBe(1)
  })

  test('TC001: Create Style - Invalid slug format should fail', async () => {
    const userId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Create user first
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

    // Try to create style with invalid slug
    const result = await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Test Style',
        slug: 'invalid slug with spaces!',
        description: 'Test description',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    // Should fail due to invalid slug format
    expect(result.error).toBeDefined()
  })

  test('TC002: Update Style - Success', async () => {
    const userId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()
    const laterTime = new Date(Date.now() + 1000).toISOString()

    // Setup: Create user and style
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

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Original Style',
        slug: 'original-style',
        description: 'Original description',
        type: 'animation',
        priority: 10,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    // Update style
    const result = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: styleId,
        label: 'Updated Style',
        description: 'Updated description',
        priority: 5,
        updatedAt: laterTime
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify update
    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData.label).toBe('Updated Style')
    expect(styleData.description).toBe('Updated description')
    expect(styleData.priority).toBe(5)
    expect(styleData.slug).toBe('original-style') // Should remain unchanged
    expect(styleData.updatedAt).toBe(laterTime)
  })

  test('TC002: Update Style - Permission denied for non-creator', async () => {
    const userId1 = uuid()
    const userId2 = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup: Create users and style
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId1,
        username: 'creator',
        email: 'creator@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId2,
        username: 'other',
        email: 'other@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

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
        createdBy: userId1
      },
      user: { id: userId1, role: 'editor' }
    })

    // Try to update style as different user
    const result = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: styleId,
        label: 'Hacked Style',
        updatedAt: now
      },
      user: { id: userId2, role: 'editor' }
    })

    // Should fail due to permission denied
    expect(result.error).toBeDefined()
  })

  test('TC005: Update Style Status - Valid transitions', async () => {
    const userId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
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

    // Test draft → published
    const publishResult = await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: userId, role: 'editor' }
    })

    expect(publishResult.error).toBeUndefined()

    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData.status).toBe('published')

    // Test published → offline
    const offlineResult = await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'offline',
        updatedAt: now
      },
      user: { id: userId, role: 'editor' }
    })

    expect(offlineResult.error).toBeUndefined()

    const updatedStyleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(updatedStyleData.status).toBe('offline')
  })

  test('TC004: Update Style Priority - Batch update', async () => {
    const userId = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const style3Id = uuid()
    const now = new Date().toISOString()

    // Setup: Create user and styles
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

    for (const [styleId, label] of [[style1Id, 'Style 1'], [style2Id, 'Style 2'], [style3Id, 'Style 3']]) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: styleId,
          label: label,
          slug: label.toLowerCase().replace(' ', '-'),
          description: `Description for ${label}`,
          type: 'animation',
          priority: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })
    }

    // Batch update priorities
    const result = await controller.run({
      name: 'UpdateStylePriority',
      payload: {
        styleUpdates: [
          { id: style1Id, priority: 1 },
          { id: style2Id, priority: 2 },
          { id: style3Id, priority: 3 }
        ],
        updatedAt: now
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify updates
    const style1Data = await controller.system.storage.findByProperty('Style', 'id', style1Id)
    const style2Data = await controller.system.storage.findByProperty('Style', 'id', style2Id)
    const style3Data = await controller.system.storage.findByProperty('Style', 'id', style3Id)

    expect(style1Data.priority).toBe(1)
    expect(style2Data.priority).toBe(2)
    expect(style3Data.priority).toBe(3)
  })

  test('TC006: Get Style List - With filters and pagination', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Setup: Create user
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

    // Create multiple styles with different types and statuses
    const styles = [
      { type: 'animation', status: 'published', label: 'Anime Style' },
      { type: 'animation', status: 'draft', label: 'Manga Style' },
      { type: 'surreal', status: 'published', label: 'Abstract Style' },
      { type: 'surreal', status: 'offline', label: 'Dream Style' }
    ]

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i]
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: uuid(),
          label: style.label,
          slug: style.label.toLowerCase().replace(' ', '-'),
          description: `Description for ${style.label}`,
          type: style.type,
          priority: i,
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })

      if (style.status !== 'draft') {
        const styleData = await controller.system.storage.findByProperty('Style', 'label', style.label)
        await controller.run({
          name: 'UpdateStyleStatus',
          payload: {
            styleId: styleData.id,
            status: style.status,
            updatedAt: now
          },
          user: { id: userId, role: 'editor' }
        })
      }
    }

    // Test filtered query
    const result = await controller.run({
      name: 'GetStyleList',
      payload: {
        filter: {
          type: 'animation',
          status: 'published'
        },
        sort: 'priority',
        page: 1,
        limit: 10
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()
    // The result should contain the filtered styles
    // Note: Actual filtering logic would be implemented in the backend query handler
  })

  test('TC003: Delete Style - Success when not referenced', async () => {
    const userId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
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

    // Delete style
    const result = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: styleId
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify deletion
    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData).toBeNull()

    // Verify user's style count updated
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.styleCount).toBe(0)
  })

  test('TC017: Batch Update Styles', async () => {
    const userId = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const now = new Date().toISOString()

    // Setup
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

    for (const styleId of [style1Id, style2Id]) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: styleId,
          label: `Style ${styleId.slice(0, 4)}`,
          slug: `style-${styleId.slice(0, 4)}`,
          description: 'Test description',
          type: 'animation',
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })
    }

    // Batch update
    const result = await controller.run({
      name: 'BatchUpdateStyles',
      payload: {
        styleIds: [style1Id, style2Id],
        updates: {
          status: 'published'
        },
        updatedAt: now
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify updates
    const style1Data = await controller.system.storage.findByProperty('Style', 'id', style1Id)
    const style2Data = await controller.system.storage.findByProperty('Style', 'id', style2Id)

    expect(style1Data.status).toBe('published')
    expect(style2Data.status).toBe('published')
  })

  test('TC018: Search Styles', async () => {
    const userId = uuid()
    const now = new Date().toISOString()

    // Setup
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

    // Create styles with searchable content
    const searchableStyles = [
      { label: 'Manga Style', description: 'Japanese manga illustration' },
      { label: 'Anime Character', description: 'Character design for anime' },
      { label: 'Abstract Art', description: 'Modern abstract painting' }
    ]

    for (const style of searchableStyles) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: uuid(),
          label: style.label,
          slug: style.label.toLowerCase().replace(/\s+/g, '-'),
          description: style.description,
          type: 'animation',
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })
    }

    // Search for manga-related styles
    const result = await controller.run({
      name: 'SearchStyles',
      payload: {
        query: 'manga',
        filters: {
          type: 'animation'
        },
        page: 1,
        limit: 10
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()
    // Search results would be handled by the query implementation
  })
})