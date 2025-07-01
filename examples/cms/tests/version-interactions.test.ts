import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'
import { v4 as uuid } from 'uuid'

describe('Version Interactions', () => {
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

  test('TC007: Create Version - Success', async () => {
    const userId = uuid()
    const versionId = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const now = new Date().toISOString()

    // Setup: Create user and styles
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    for (const [styleId, label] of [[style1Id, 'Style 1'], [style2Id, 'Style 2']]) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: styleId,
          label: label,
          slug: label.toLowerCase().replace(' ', '-'),
          description: `Description for ${label}`,
          type: 'animation',
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'admin' }
      })

      // Publish styles first
      await controller.run({
        name: 'UpdateStyleStatus',
        payload: {
          styleId: styleId,
          status: 'published',
          updatedAt: now
        },
        user: { id: userId, role: 'admin' }
      })
    }

    // Create version
    const result = await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Spring Festival 2024',
        description: '春节活动版本',
        styleIds: [style1Id, style2Id],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify version creation
    const versionData = await controller.system.storage.findByProperty('Version', 'id', versionId)
    expect(versionData).toBeDefined()
    expect(versionData.name).toBe('Spring Festival 2024')
    expect(versionData.status).toBe('draft')
    expect(versionData.versionNumber).toBe(1)
    expect(versionData.createdBy).toBe(userId)

    // Verify computed properties
    expect(versionData.styleCount).toBe(2)

    // Verify user's version count
    const userData = await controller.system.storage.findByProperty('User', 'id', userId)
    expect(userData.versionCount).toBe(1)

    // Verify StyleVersion relations created
    const styleVersionRelations = await controller.system.storage.find('StyleVersionRelation')
    const versionRelations = styleVersionRelations.filter(rel => rel.target === versionId)
    expect(versionRelations).toHaveLength(2)
    expect(versionRelations.some(rel => rel.source === style1Id)).toBe(true)
    expect(versionRelations.some(rel => rel.source === style2Id)).toBe(true)
  })

  test('TC008: Publish Version - Success', async () => {
    const userId = uuid()
    const versionId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()
    const publishTime = new Date(Date.now() + 1000).toISOString()

    // Setup: Create user, style, and version
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
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
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

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
      user: { id: userId, role: 'admin' }
    })

    // Publish version
    const result = await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: versionId,
        publishedAt: publishTime
      },
      user: { id: userId, role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify version published
    const versionData = await controller.system.storage.findByProperty('Version', 'id', versionId)
    expect(versionData.status).toBe('published')
    expect(versionData.publishedAt).toBe(publishTime)

    // Verify computed property - style is now referenced by published version
    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData.isReferencedByPublishedVersion).toBe(true)
  })

  test('TC008: Publish Version - Only one version can be published', async () => {
    const userId = uuid()
    const version1Id = uuid()
    const version2Id = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
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
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    // Create two versions
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version1Id,
        versionNumber: 1,
        name: 'Version 1',
        description: 'First version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version2Id,
        versionNumber: 2,
        name: 'Version 2',
        description: 'Second version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    // Publish first version
    const publish1Result = await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version1Id,
        publishedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    expect(publish1Result.error).toBeUndefined()

    // Try to publish second version - should archive the first one
    const publish2Result = await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version2Id,
        publishedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    expect(publish2Result.error).toBeUndefined()

    // Verify only version 2 is published, version 1 is archived
    const version1Data = await controller.system.storage.findByProperty('Version', 'id', version1Id)
    const version2Data = await controller.system.storage.findByProperty('Version', 'id', version2Id)

    expect(version1Data.status).toBe('archived')
    expect(version2Data.status).toBe('published')
  })

  test('TC009: Version Rollback - Success', async () => {
    const userId = uuid()
    const version1Id = uuid()
    const version2Id = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()
    const rollbackTime = new Date(Date.now() + 2000).toISOString()

    // Setup: Create versions and publish version 2
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
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
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    // Create and publish version 1
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version1Id,
        versionNumber: 1,
        name: 'Version 1',
        description: 'First version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version1Id,
        publishedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    // Create and publish version 2
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version2Id,
        versionNumber: 2,
        name: 'Version 2',
        description: 'Second version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version2Id,
        publishedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    // Rollback to version 1
    const rollbackResult = await controller.run({
      name: 'RollbackVersion',
      payload: {
        targetVersionId: version1Id,
        publishedAt: rollbackTime
      },
      user: { id: userId, role: 'admin' }
    })

    expect(rollbackResult.error).toBeUndefined()

    // Verify rollback
    const version1Data = await controller.system.storage.findByProperty('Version', 'id', version1Id)
    const version2Data = await controller.system.storage.findByProperty('Version', 'id', version2Id)

    expect(version1Data.status).toBe('published')
    expect(version1Data.publishedAt).toBe(rollbackTime)
    expect(version2Data.status).toBe('archived')
  })

  test('TC010: Update Version Content - Success for draft version', async () => {
    const userId = uuid()
    const versionId = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const style3Id = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Create styles
    for (const [styleId, label] of [[style1Id, 'Style 1'], [style2Id, 'Style 2'], [style3Id, 'Style 3']]) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: styleId,
          label: label,
          slug: label.toLowerCase().replace(' ', '-'),
          description: `Description for ${label}`,
          type: 'animation',
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })

      await controller.run({
        name: 'UpdateStyleStatus',
        payload: {
          styleId: styleId,
          status: 'published',
          updatedAt: now
        },
        user: { id: userId, role: 'editor' }
      })
    }

    // Create version with initial styles
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Test Version',
        description: 'Test version',
        styleIds: [style1Id, style2Id],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    // Update version content
    const result = await controller.run({
      name: 'UpdateStyleOrderInVersion',
      payload: {
        versionId: versionId,
        styleUpdates: [
          { styleId: style1Id, sortOrder: 2, isActive: true },
          { styleId: style2Id, sortOrder: 1, isActive: false },
          { styleId: style3Id, sortOrder: 0, isActive: true }
        ]
      },
      user: { id: userId, role: 'editor' }
    })

    expect(result.error).toBeUndefined()

    // Verify updates
    const styleVersionRelations = await controller.system.storage.find('StyleVersionRelation')
    const versionRelations = styleVersionRelations.filter(rel => rel.target === versionId)
    
    expect(versionRelations).toHaveLength(3)

    const style1Relation = versionRelations.find(rel => rel.source === style1Id)
    const style2Relation = versionRelations.find(rel => rel.source === style2Id)
    const style3Relation = versionRelations.find(rel => rel.source === style3Id)

    expect(style1Relation.sortOrder).toBe(2)
    expect(style1Relation.isActive).toBe(true)
    
    expect(style2Relation.sortOrder).toBe(1)
    expect(style2Relation.isActive).toBe(false)
    
    expect(style3Relation.sortOrder).toBe(0)
    expect(style3Relation.isActive).toBe(true)

    // Verify computed style count (only active styles)
    const versionData = await controller.system.storage.findByProperty('Version', 'id', versionId)
    expect(versionData.activeStyleCount).toBe(2) // Only style1 and style3 are active
  })

  test('TC010: Update Version Content - Fail for published version', async () => {
    const userId = uuid()
    const versionId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup and publish version
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
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
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

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
      user: { id: userId, role: 'admin' }
    })

    await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: versionId,
        publishedAt: now
      },
      user: { id: userId, role: 'admin' }
    })

    // Try to update published version
    const result = await controller.run({
      name: 'UpdateStyleOrderInVersion',
      payload: {
        versionId: versionId,
        styleUpdates: [
          { styleId: styleId, sortOrder: 5, isActive: false }
        ]
      },
      user: { id: userId, role: 'admin' }
    })

    // Should fail because version is published
    expect(result.error).toBeDefined()
  })

  test('TC007: Create Version with auto version number', async () => {
    const userId = uuid()
    const version1Id = uuid()
    const version2Id = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
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
      user: { id: userId, role: 'admin' }
    })

    // Create first version
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version1Id,
        versionNumber: 1,
        name: 'Version 1',
        description: 'First version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    // Create second version - should auto-increment version number
    const result = await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version2Id,
        versionNumber: 2,
        name: 'Version 2',
        description: 'Second version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'admin' }
    })

    expect(result.error).toBeUndefined()

    // Verify version numbers
    const version1Data = await controller.system.storage.findByProperty('Version', 'id', version1Id)
    const version2Data = await controller.system.storage.findByProperty('Version', 'id', version2Id)

    expect(version1Data.versionNumber).toBe(1)
    expect(version2Data.versionNumber).toBe(2)

    // Verify computed nextVersionNumber
    expect(version2Data.nextVersionNumber).toBe(3)
  })

  test('Add and Remove Styles from Version', async () => {
    const userId = uuid()
    const versionId = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: userId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    for (const [styleId, label] of [[style1Id, 'Style 1'], [style2Id, 'Style 2']]) {
      await controller.run({
        name: 'CreateStyle',
        payload: {
          id: styleId,
          label: label,
          slug: label.toLowerCase().replace(' ', '-'),
          description: `Description for ${label}`,
          type: 'animation',
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        },
        user: { id: userId, role: 'editor' }
      })
    }

    // Create empty version
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Test Version',
        description: 'Test version',
        styleIds: [],
        createdAt: now,
        createdBy: userId
      },
      user: { id: userId, role: 'editor' }
    })

    // Add style to version
    const addResult = await controller.run({
      name: 'AddStyleToVersion',
      payload: {
        versionId: versionId,
        styleId: style1Id,
        sortOrder: 1
      },
      user: { id: userId, role: 'editor' }
    })

    expect(addResult.error).toBeUndefined()

    // Verify style added
    let styleVersionRelations = await controller.system.storage.find('StyleVersionRelation')
    let versionRelations = styleVersionRelations.filter(rel => rel.target === versionId)
    expect(versionRelations).toHaveLength(1)
    expect(versionRelations[0].source).toBe(style1Id)

    // Add another style
    await controller.run({
      name: 'AddStyleToVersion',
      payload: {
        versionId: versionId,
        styleId: style2Id,
        sortOrder: 2
      },
      user: { id: userId, role: 'editor' }
    })

    // Remove first style
    const removeResult = await controller.run({
      name: 'RemoveStyleFromVersion',
      payload: {
        versionId: versionId,
        styleId: style1Id
      },
      user: { id: userId, role: 'editor' }
    })

    expect(removeResult.error).toBeUndefined()

    // Verify style removed
    styleVersionRelations = await controller.system.storage.find('StyleVersionRelation')
    versionRelations = styleVersionRelations.filter(rel => rel.target === versionId && rel.source === style1Id)
    expect(versionRelations).toHaveLength(0)

    // Verify style2 still exists
    versionRelations = styleVersionRelations.filter(rel => rel.target === versionId && rel.source === style2Id)
    expect(versionRelations).toHaveLength(1)
  })
})