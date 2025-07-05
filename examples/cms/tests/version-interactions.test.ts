import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'

describe('Version Interactions', () => {
  let system: MonoSystem
  let controller: Controller
  let adminUser: any
  let editorUser: any
  let testStyleId: string

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

    // Create a test style to use in version tests
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation',
        priority: 100
      }
    })

    // Publish the style
    const styles = await system.storage.find('Style')
    testStyleId = styles[0].id
    
    await controller.callInteraction('PublishStyle', {
      user: adminUser,
      payload: { styleId: testStyleId }
    })
  })

  // TC007: Create Version
  test('TC007: should create version successfully', async () => {
    const result = await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Spring 2024 Collection',
        description: 'Spring collection with new animation styles'
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify version was created
    const versions = await system.storage.find('Version')
    expect(versions).toHaveLength(1)
    expect(versions[0].label).toBe('Spring 2024 Collection')
    expect(versions[0].description).toBe('Spring collection with new animation styles')
    expect(versions[0].isActive).toBe(false)
    expect(versions[0].versionNumber).toBeDefined()
    expect(versions[0].createdAt).toBeDefined()
  })

  // TC008: Publish Version
  test('TC008: should publish version successfully', async () => {
    // Create version
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Test Version',
        description: 'Test version'
      }
    })

    const versions = await system.storage.find('Version')
    const versionId = versions[0].id

    // Publish the version
    const result = await controller.callInteraction('PublishVersion', {
      user: adminUser,
      payload: {
        versionId: versionId
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify version is active
    const publishedVersions = await system.storage.find('Version')
    expect(publishedVersions[0].isActive).toBe(true)
  })

  // TC009: Add Style to Version
  test('TC009: should add style to version successfully', async () => {
    // Create version
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Test Version',
        description: 'Test version'
      }
    })

    const versions = await system.storage.find('Version')
    const versionId = versions[0].id

    // Add style to version
    const result = await controller.callInteraction('AddStyleToVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleId: testStyleId,
        order: 1
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify StyleVersion relation was created
    const styleVersions = await system.storage.find('StyleVersion')
    expect(styleVersions).toHaveLength(1)
    expect(styleVersions[0].order).toBe(1)
    expect(styleVersions[0].status).toBe('active')
  })

  // TC010: Reorder Styles in Version
  test('TC010: should reorder styles in version successfully', async () => {
    // Create second style
    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: {
        label: 'Second Style',
        slug: 'second-style',
        type: 'surreal',
        priority: 200
      }
    })

    const styles = await system.storage.find('Style')
    const secondStyleId = styles.find(s => s.slug === 'second-style').id

    // Publish second style
    await controller.callInteraction('PublishStyle', {
      user: adminUser,
      payload: { styleId: secondStyleId }
    })

    // Create version
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Test Version',
        description: 'Test version'
      }
    })

    const versions = await system.storage.find('Version')
    const versionId = versions[0].id

    // Add both styles to version
    await controller.callInteraction('AddStyleToVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleId: testStyleId,
        order: 1
      }
    })

    await controller.callInteraction('AddStyleToVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleId: secondStyleId,
        order: 2
      }
    })

    // Reorder styles in version
    const result = await controller.callInteraction('ReorderStylesInVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleOrders: [
          { styleId: testStyleId, order: 3 },
          { styleId: secondStyleId, order: 1 }
        ]
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify reordering
    const styleVersions = await system.storage.find('StyleVersion')
    const firstStyleVersion = styleVersions.find(sv => sv.style?.id === testStyleId)
    const secondStyleVersion = styleVersions.find(sv => sv.style?.id === secondStyleId)
    
    expect(firstStyleVersion.order).toBe(3)
    expect(secondStyleVersion.order).toBe(1)
  })

  // TC011: Permission Denied - Editor Cannot Publish Version
  test('TC011: editor should not be able to publish version', async () => {
    // Create version as admin
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Test Version',
        description: 'Test version'
      }
    })

    const versions = await system.storage.find('Version')
    const versionId = versions[0].id

    // Try to publish as editor
    const result = await controller.callInteraction('PublishVersion', {
      user: editorUser,
      payload: {
        versionId: versionId
      }
    })

    expect(result.error).toBeDefined()
    expect((result.error as any)?.type).toBe('permission denied')
    
    // Verify version not published
    const unchangedVersions = await system.storage.find('Version')
    expect(unchangedVersions[0].isActive).toBe(false)
  })

  // TC013: Rollback to Previous Version
  test('TC013: should rollback to previous version successfully', async () => {
    // Create first version and publish it
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Version 1',
        description: 'First version'
      }
    })

    const firstVersions = await system.storage.find('Version')
    const firstVersionId = firstVersions[0].id

    await controller.callInteraction('PublishVersion', {
      user: adminUser,
      payload: { versionId: firstVersionId }
    })

    // Create second version and publish it
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Version 2',
        description: 'Second version'
      }
    })

    const allVersions = await system.storage.find('Version')
    const secondVersionId = allVersions.find(v => v.label === 'Version 2').id

    await controller.callInteraction('PublishVersion', {
      user: adminUser,
      payload: { versionId: secondVersionId }
    })

    // Verify second version is active
    let currentVersions = await system.storage.find('Version')
    expect(currentVersions.find(v => v.id === firstVersionId).isActive).toBe(false)
    expect(currentVersions.find(v => v.id === secondVersionId).isActive).toBe(true)

    // Rollback to first version
    const rollbackResult = await controller.callInteraction('PublishVersion', {
      user: adminUser,
      payload: { versionId: firstVersionId }
    })

    expect(rollbackResult.error).toBeUndefined()
    
    // Verify rollback
    currentVersions = await system.storage.find('Version')
    expect(currentVersions.find(v => v.id === firstVersionId).isActive).toBe(true)
    expect(currentVersions.find(v => v.id === secondVersionId).isActive).toBe(false)
  })

  // Test remove style from version
  test('should remove style from version successfully', async () => {
    // Create version
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        label: 'Test Version',
        description: 'Test version'
      }
    })

    const versions = await system.storage.find('Version')
    const versionId = versions[0].id

    // Add style to version
    await controller.callInteraction('AddStyleToVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleId: testStyleId,
        order: 1
      }
    })

    // Verify style was added
    let styleVersions = await system.storage.find('StyleVersion')
    expect(styleVersions).toHaveLength(1)
    expect(styleVersions[0].status).toBe('active')

    // Remove style from version
    const result = await controller.callInteraction('RemoveStyleFromVersion', {
      user: adminUser,
      payload: {
        versionId: versionId,
        styleId: testStyleId
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify style was removed (soft delete)
    styleVersions = await system.storage.find('StyleVersion')
    expect(styleVersions[0].status).toBe('removed')
    expect(styleVersions[0].isActive).toBe(false)
  })

  // Test editor cannot create versions
  test('should not allow editor to create versions', async () => {
    const result = await controller.callInteraction('CreateVersion', {
      user: editorUser,
      payload: {
        label: 'Editor Version',
        description: 'Version by editor'
      }
    })

    expect(result.error).toBeDefined()
    expect((result.error as any)?.type).toBe('permission denied')
    
    // Verify no version created
    const versions = await system.storage.find('Version')
    expect(versions).toHaveLength(0)
  })

  // Test multiple active versions scenario
  test('should ensure only one version is active at a time', async () => {
    // Create multiple versions
    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: { label: 'Version A', description: 'First version' }
    })

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: { label: 'Version B', description: 'Second version' }
    })

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: { label: 'Version C', description: 'Third version' }
    })

    const versions = await system.storage.find('Version')
    expect(versions).toHaveLength(3)

    // Publish middle version
    const versionBId = versions.find(v => v.label === 'Version B').id
    await controller.callInteraction('PublishVersion', {
      user: adminUser,
      payload: { versionId: versionBId }
    })

    // Verify only Version B is active
    const updatedVersions = await system.storage.find('Version')
    const activeVersions = updatedVersions.filter(v => v.isActive)
    expect(activeVersions).toHaveLength(1)
    expect(activeVersions[0].label).toBe('Version B')
  })
})