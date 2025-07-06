import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend'

describe('CMS Style Management Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller(
      system,
      entities,
      relations,
      [],           // activities
      interactions, // interactions
      [],           // global dictionaries
      []            // side effects
    )

    await controller.setup(true)
  })

  // TC001: Create Style (via CreateStyle Interaction)
  test('TC001: should create style successfully', async () => {
    // Create test user
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Call CreateStyle interaction
    const result = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'Cyberpunk',
        slug: 'cyberpunk',
        description: 'Futuristic digital art style',
        type: 'digital',
        thumbKey: 'styles/cyberpunk-thumb.jpg',
        priority: 10
      }
    })
    
    // Check if interaction succeeded
    expect(result.error).toBeUndefined()
    
    // Verify the style was created with correct default values
    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'cyberpunk'] }),
      undefined,
      ['id', 'label', 'slug', 'description', 'type', 'thumbKey', 'priority', 'status', 'createdAt', 'updatedAt']
    )
    
    expect(style).toBeTruthy()
    expect(style.label).toBe('Cyberpunk')
    expect(style.slug).toBe('cyberpunk')
    expect(style.description).toBe('Futuristic digital art style')
    expect(style.type).toBe('digital')
    expect(style.thumbKey).toBe('styles/cyberpunk-thumb.jpg')
    expect(style.priority).toBe(10)
    expect(style.status).toBe('draft') // Default status
    expect(style.createdAt).toBeGreaterThan(0)
    expect(style.updatedAt).toBeGreaterThan(0)
  })

  // TC002: Create Style with Invalid Data (via CreateStyle Interaction)
  test('TC002: should fail to create style with invalid data', async () => {
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Try to create style with empty required fields
    const result = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: '', // Empty required field
        slug: 'invalid slug!@#', // Invalid slug characters
        type: '' // Empty required field
      }
    })
    
    // Should return error for validation failure
    expect(result.error).toBeDefined()
    
    // Verify no style was created
    const styles = await system.storage.find('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'invalid slug!@#'] }),
      undefined,
      ['id']
    )
    
    expect(styles.length).toBe(0)
  })

  // TC004: Publish Style (via PublishStyle Interaction)
  test('TC004: should publish style successfully', async () => {
    // Setup: Create a user and style first
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Create style
    const createResult = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        description: 'A test style',
        type: 'basic',
        priority: 5
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    // Find the created style
    const createdStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'test-style'] }),
      undefined,
      ['id']
    )
    const styleId = createdStyle.id
    
    // Publish the style
    const publishResult = await controller.callInteraction('PublishStyle', {
      user: testUser,
      payload: {
        style: { id: styleId }
      }
    })
    
    expect(publishResult.error).toBeUndefined()
    
    // Verify status changed to published
    const publishedStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['id', 'status', 'updatedAt']
    )
    
    expect(publishedStyle.status).toBe('published')
  })

  // TC005: Unpublish Style (via UnpublishStyle Interaction)
  test('TC005: should unpublish style successfully', async () => {
    // Setup: Create a user and published style
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Create and publish style
    const createResult = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'Published Style',
        slug: 'published-style',
        type: 'premium'
      }
    })
    
    // Find the created style
    const createdStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'published-style'] }),
      undefined,
      ['id']
    )
    const styleId = createdStyle.id
    
    await controller.callInteraction('PublishStyle', {
      user: testUser,
      payload: { style: { id: styleId } }
    })
    
    // Now unpublish it
    const unpublishResult = await controller.callInteraction('UnpublishStyle', {
      user: testUser,
      payload: {
        style: { id: styleId }
      }
    })
    
    expect(unpublishResult.error).toBeUndefined()
    
    // Verify status changed to offline
    const unpublishedStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      ['id', 'status']
    )
    
    expect(unpublishedStyle.status).toBe('offline')
  })

  // TC009: List Published Styles - should only return published styles
  test('TC011: should list only published styles', async () => {
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Create multiple styles with different statuses
    const style1Result = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: { label: 'Draft Style', slug: 'draft-style', type: 'basic' }
    })
    
    const style2Result = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: { label: 'Published Style', slug: 'published-style', type: 'premium' }
    })
    
    // Find the second style and publish it
    const style2 = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'published-style'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('PublishStyle', {
      user: testUser,
      payload: { style: { id: style2.id } }
    })
    
    // List published styles
    const listResult = await controller.callInteraction('ListPublishedStyles', {
      user: testUser,
      payload: { page: 1, limit: 10 }
    })
    
    expect(listResult.error).toBeUndefined()
    
    // Verify only published styles are returned
    const publishedStyles = await system.storage.find('PublishedStyle',
      MatchExp.atom({ key: 'status', value: ['=', 'published'] }),
      undefined,
      ['id', 'label', 'status']
    )
    
    expect(publishedStyles.length).toBe(1)
    expect(publishedStyles[0].label).toBe('Published Style')
    expect(publishedStyles[0].status).toBe('published')
  })

  // TC014: Duplicate Slug Validation (via CreateStyle Interaction)
  test('TC014: should prevent duplicate slug creation', async () => {
    const testUser = await system.storage.create('User', {
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    })
    
    // Create first style
    const firstResult = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'First Style',
        slug: 'unique-slug',
        type: 'basic'
      }
    })
    
    expect(firstResult.error).toBeUndefined()
    
    // Try to create second style with same slug
    const secondResult = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'Second Style',
        slug: 'unique-slug', // Same slug
        type: 'premium'
      }
    })
    
    // Should return error for duplicate slug
    expect(secondResult.error).toBeDefined()
    
    // Verify only one style exists with this slug
    const stylesWithSlug = await system.storage.find('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'unique-slug'] }),
      undefined,
      ['id', 'label']
    )
    
    expect(stylesWithSlug.length).toBe(1)
    expect(stylesWithSlug[0].label).toBe('First Style')
  })

  // Basic CRUD functionality test
  test('should verify user-style relationship is created', async () => {
    const testUser = await system.storage.create('User', {
      username: 'creator',
      email: 'creator@example.com',
      role: 'editor'
    })
    
    const createResult = await controller.callInteraction('CreateStyle', {
      user: testUser,
      payload: {
        label: 'User Style',
        slug: 'user-style',
        type: 'basic'
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    // Verify the creator relationship was created automatically
    const createdStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'user-style'] }),
      undefined,
      ['id', 'creator']
    )
    
    expect(createdStyle).toBeTruthy()
    expect(createdStyle.creator.id).toBe(testUser.id)
  })
})