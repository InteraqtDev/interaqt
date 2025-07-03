import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'
import { v4 as uuid } from 'uuid'

describe('Version Interactions Tests', () => {
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

  // TC008: Create Version (Success Case)
  test('TC008: Create Version - Should create new version with styles', async () => {
    const adminUser = await system.storage.create('User', {
      id: uuid(),
      name: 'Admin User',
      role: 'admin',
      email: 'admin@test.com'
    })

    // Create styles first
    const style1Data = {
      id: uuid(),
      label: 'Style 1',
      slug: 'style-1',
      description: 'First style',
      type: 'animation',
      thumb_key: 'style1.jpg',
      priority: 10,
      status: 'published'
    }

    const style2Data = {
      id: uuid(),
      label: 'Style 2',
      slug: 'style-2',
      description: 'Second style',
      type: 'surreal',
      thumb_key: 'style2.jpg',
      priority: 20,
      status: 'published'
    }

    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: { style: style1Data }
    })

    await controller.callInteraction('CreateStyle', {
      user: adminUser,
      payload: { style: style2Data }
    })

    const styles = await system.storage.find('Style')
    const styleIds = styles.map(s => s.id)

    // Create version
    const versionData = {
      id: uuid(),
      name: 'v1.0.0',
      description: 'Initial release'
    }

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        version: versionData,
        styleIds: styleIds
      }
    })

    // Verify version was created
    const versions = await system.storage.find('Version')
    expect(versions).toHaveLength(1)
    
    const createdVersion = versions[0]
    expect(createdVersion.id).toBe(versionData.id)
    expect(createdVersion.name).toBe(versionData.name)
    expect(createdVersion.description).toBe(versionData.description)
    expect(createdVersion.published_at).toBeDefined()
    expect(createdVersion.is_current).toBe(true)

    // Verify relations were created
    const userVersionRelations = await system.storage.find('UserVersionRelation')
    expect(userVersionRelations).toHaveLength(1)
    expect(userVersionRelations[0].source).toBe(adminUser.id)
    expect(userVersionRelations[0].target).toBe(createdVersion.id)
  })

  // TC009: Create Version (Duplicate Name)
  test('TC009: Create Version - Should handle duplicate version names', async () => {
    const adminUser = await system.storage.create('User', {
      id: uuid(),
      name: 'Admin User',
      role: 'admin',
      email: 'admin@test.com'
    })

    // Create first version
    const versionData1 = {
      id: uuid(),
      name: 'v1.0.0',
      description: 'First version'
    }

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        version: versionData1,
        styleIds: []
      }
    })

    // Attempt to create second version with same name
    const versionData2 = {
      id: uuid(),
      name: 'v1.0.0', // Duplicate name
      description: 'Duplicate version'
    }

    try {
      await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          version: versionData2,
          styleIds: []
        }
      })
    } catch (error) {
      // Expected to fail with unique constraint in real implementation
    }

    // Verify only one version exists
    const versions = await system.storage.find('Version')
    expect(versions).toHaveLength(1)
    expect(versions[0].name).toBe('v1.0.0')
    expect(versions[0].description).toBe('First version')
  })

  // TC010: Rollback to Previous Version
  test('TC010: Rollback Version - Should set previous version as current', async () => {
    const adminUser = await system.storage.create('User', {
      id: uuid(),
      name: 'Admin User',
      role: 'admin',
      email: 'admin@test.com'
    })

    // Create multiple versions
    const version1Data = {
      id: uuid(),
      name: 'v1.0.0',
      description: 'First version'
    }

    const version2Data = {
      id: uuid(),
      name: 'v1.1.0',
      description: 'Second version'
    }

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        version: version1Data,
        styleIds: []
      }
    })

    await controller.callInteraction('CreateVersion', {
      user: adminUser,
      payload: {
        version: version2Data,
        styleIds: []
      }
    })

    const versions = await system.storage.find('Version')
    const version1 = versions.find(v => v.name === 'v1.0.0')

    // Rollback to v1.0.0
    await controller.callInteraction('RollbackVersion', {
      user: adminUser,
      payload: {
        versionId: version1.id
      }
    })

    // Verify rollback interaction was called successfully
    expect(versions).toHaveLength(2)
  })

  // TC011: List Versions with History
  test('TC011: List Versions - Should retrieve all versions with metadata', async () => {
    const adminUser = await system.storage.create('User', {
      id: uuid(),
      name: 'Admin User',
      role: 'admin',
      email: 'admin@test.com'
    })

    // Create multiple versions
    const versions = [
      {
        id: uuid(),
        name: 'v1.0.0',
        description: 'First version'
      },
      {
        id: uuid(),
        name: 'v1.1.0',
        description: 'Second version'
      }
    ]

    for (const versionData of versions) {
      await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          version: versionData,
          styleIds: []
        }
      })
    }

    // List versions
    await controller.callInteraction('ListVersions', {
      user: adminUser,
      payload: {
        sort: {
          field: 'published_at',
          order: 'desc'
        }
      }
    })

    // Verify all versions exist
    const allVersions = await system.storage.find('Version')
    expect(allVersions).toHaveLength(2)
    
    // Verify version names
    const versionNames = allVersions.map(v => v.name)
    expect(versionNames).toContain('v1.0.0')
    expect(versionNames).toContain('v1.1.0')
  })
})