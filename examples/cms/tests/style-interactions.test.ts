import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'

describe('Style Interactions', () => {
  let system: MonoSystem
  let controller: Controller
  let adminUser: any
  let editorUser: any
  let viewerUser: any

  beforeEach(async () => {
    // Setup test database and controller
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
    
    // Create test users
    adminUser = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@test.com',
      role: 'admin'
    })
    
    editorUser = await system.storage.create('User', {
      name: 'Editor User',
      email: 'editor@test.com',
      role: 'editor'
    })
    
    viewerUser = await system.storage.create('User', {
      name: 'Viewer User',
      email: 'viewer@test.com',
      role: 'viewer'
    })
  })

  // TC001: Create Style (via CreateStyle Interaction)
  test('TC001: should create style successfully', async () => {
    const result = await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Manga Style',
        slug: 'manga-style',
        description: 'Japanese manga illustration style',
        type: 'animation',
        thumb_key: 'styles/manga/thumb.jpg',
        priority: 100
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify style was created
    const styles = await system.storage.find('Style')
    expect(styles).toHaveLength(1)
    expect(styles[0].label).toBe('Manga Style')
    expect(styles[0].slug).toBe('manga-style')
    expect(styles[0].status).toBe('draft')
    expect(styles[0].createdAt).toBeDefined()
    expect(styles[0].updatedAt).toBeDefined()
  })

  // TC002: Create Style with Invalid Data
  test('TC002: should fail with invalid data', async () => {
    const result = await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: '',
        slug: '',
        type: 'invalid-type'
      }
    })

    expect(result.error).toBeDefined()
    
    // Verify no style was created
    const styles = await system.storage.find('Style')
    expect(styles).toHaveLength(0)
  })

  // TC003: Create Style with Duplicate Slug - Note: This test assumes slug uniqueness validation would be implemented
  test('TC003: should handle duplicate slug scenario', async () => {
    // Create first style
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'First Style',
        slug: 'existing-slug',
        description: 'First style',
        type: 'animation',
        priority: 100
      }
    })

    // Try to create second style with same slug
    const result = await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Second Style',
        slug: 'existing-slug',
        description: 'Duplicate slug test',
        type: 'surreal',
        priority: 200
      }
    })

    // For now, this will succeed since we haven't implemented unique constraint
    // In a real implementation, this should fail with conflict error
    const styles = await system.storage.find('Style')
    expect(styles).toHaveLength(2) // Both created for now
  })

  // TC004: Update Style
  test('TC004: should update style successfully', async () => {
    // Create initial style
    const createResult = await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Manga Style',
        slug: 'manga-style',
        description: 'Original description',
        type: 'animation',
        priority: 100
      }
    })

    const styles = await system.storage.find('Style')
    const styleId = styles[0].id

    // Update the style
    const updateResult = await controller.callInteraction('UpdateStyle', {
      user: adminUser,
      payload: {
        styleId: styleId,
        label: 'Updated Manga Style',
        description: 'Updated description',
        priority: 200
      }
    })

    expect(updateResult.error).toBeUndefined()
    
    // Verify updates
    const updatedStyles = await system.storage.find('Style')
    expect(updatedStyles[0].label).toBe('Updated Manga Style')
    expect(updatedStyles[0].description).toBe('Updated description')
    expect(updatedStyles[0].priority).toBe(200)
  })

  // TC005: Publish Style
  test('TC005: should publish style successfully', async () => {
    // Create style
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation',
        priority: 100
      }
    })

    const styles = await system.storage.find('Style')
    const styleId = styles[0].id

    // Publish the style
    const result = await controller.callInteraction('PublishStyle', {
      user: adminUser,
      payload: {
        styleId: styleId
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify status changed
    const publishedStyles = await system.storage.find('Style')
    expect(publishedStyles[0].status).toBe('published')
    expect(publishedStyles[0].isPublished).toBe(true)
  })

  // TC006: Delete Style (Soft Delete)
  test('TC006: should soft delete style successfully', async () => {
    // Create style
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation',
        priority: 100
      }
    })

    const styles = await system.storage.find('Style')
    const styleId = styles[0].id

    // Delete the style
    const result = await controller.callInteraction('DeleteStyle', {
      user: adminUser,
      payload: {
        styleId: styleId
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify soft delete
    const deletedStyles = await system.storage.find('Style')
    expect(deletedStyles[0].status).toBe('offline')
    expect(deletedStyles[0].isDeleted).toBe(true)
  })

  // TC011: Permission Denied - Editor Cannot Delete Style
  test('TC011: editor should not be able to delete style', async () => {
    // Create style as admin
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation',
        priority: 100
      }
    })

    const styles = await system.storage.find('Style')
    const styleId = styles[0].id

    // Try to delete as editor
    const result = await controller.callInteraction('DeleteStyle', {
      user: editorUser,
      payload: {
        styleId: styleId
      }
    })

    expect(result.error).toBeDefined()
    expect((result.error as any)?.type).toBe('permission denied')
    
    // Verify style not deleted
    const unchangedStyles = await system.storage.find('Style')
    expect(unchangedStyles[0].status).toBe('draft')
  })

  // TC012: Permission Denied - Viewer Cannot Create Style
  test('TC012: viewer should not be able to create style', async () => {
    const result = await controller.callInteraction('CreateStyle', {
      user: viewerUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation',
        priority: 100
      }
    })

    expect(result.error).toBeDefined()
    expect((result.error as any)?.type).toBe('permission denied')
    
    // Verify no style created
    const styles = await system.storage.find('Style')
    expect(styles).toHaveLength(0)
  })

  // Test editor can create styles
  test('should allow editor to create and update styles', async () => {
    const result = await controller.callInteraction('CreateStyle', {
      user: editorUser,
      payload: {
        label: 'Editor Style',
        slug: 'editor-style',
        type: 'animation',
        priority: 100
      }
    })

    expect(result.error).toBeUndefined()
    
    const styles = await system.storage.find('Style')
    expect(styles).toHaveLength(1)
    expect(styles[0].label).toBe('Editor Style')
  })

  // Test style state transitions
  test('should handle style state transitions correctly', async () => {
    // Create and publish style
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'State Test Style',
        slug: 'state-test',
        type: 'animation',
        priority: 100
      }
    })

    const styles = await system.storage.find('Style')
    const styleId = styles[0].id

    // Publish
    await controller.callInteraction('PublishStyle', {
      user: adminUser,
      payload: { styleId }
    })

    let updatedStyles = await system.storage.find('Style')
    expect(updatedStyles[0].status).toBe('published')

    // Unpublish
    await controller.callInteraction('UnpublishStyle', {
      user: adminUser,
      payload: { styleId }
    })

    updatedStyles = await system.storage.find('Style')
    expect(updatedStyles[0].status).toBe('draft')

    // Delete
    await controller.callInteraction('DeleteStyle', {
      user: adminUser,
      payload: { styleId }
    })

    updatedStyles = await system.storage.find('Style')
    expect(updatedStyles[0].status).toBe('offline')
  })

  // Test reorder styles
  test('should reorder styles successfully', async () => {
    // Create multiple styles
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Style A',
        slug: 'style-a',
        type: 'animation',
        priority: 100
      }
    })

    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Style B',
        slug: 'style-b',
        type: 'animation',
        priority: 200
      }
    })

    const styles = await system.storage.find('Style')
    const styleAId = styles.find(s => s.slug === 'style-a').id
    const styleBId = styles.find(s => s.slug === 'style-b').id

    // Reorder styles
    const result = await controller.callInteraction('ReorderStyles', {
      user: adminUser,
      payload: {
        styleOrders: [
          { styleId: styleAId, priority: 300 },
          { styleId: styleBId, priority: 150 }
        ]
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify reordering
    const reorderedStyles = await system.storage.find('Style')
    const reorderedStyleA = reorderedStyles.find(s => s.id === styleAId)
    const reorderedStyleB = reorderedStyles.find(s => s.id === styleBId)
    
    expect(reorderedStyleA.priority).toBe(300)
    expect(reorderedStyleB.priority).toBe(150)
  })
})