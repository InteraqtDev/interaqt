import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB, MatchExp } from 'interaqt'
import { v4 as uuid } from 'uuid'
import { entities, relations, interactions, activities } from '../backend'

describe('Version Interactions', () => {
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

  describe('TC008: Create Version Snapshot', () => {
    beforeEach(async () => {
      // Create some styles to snapshot
      const styles = [
        { id: uuid(), label: 'Style 1', slug: 'style-1', status: 'published' },
        { id: uuid(), label: 'Style 2', slug: 'style-2', status: 'draft' }
      ]

      for (const style of styles) {
        await system.storage.create('Style', {
          id: style.id,
          label: style.label,
          slug: style.slug,
          description: `Description for ${style.label}`,
          type: 'animation',
          thumbKey: `${style.slug}-thumb.jpg`,
          priority: 100,
          status: style.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
    })

    test('should create version snapshot successfully', async () => {
      const versionData = {
        name: 'Pre-Holiday-Update',
        description: 'Snapshot before holiday style changes',
        snapshot: JSON.stringify({ styles: ['test-data'] })
      }

      const result = await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: versionData
      })

      expect(result.error).toBeUndefined()

      const versions = await system.storage.find('Version',
        MatchExp.atom({ key: 'name', value: ['=', 'Pre-Holiday-Update'] })
      )

      expect(versions).toHaveLength(1)
      expect(versions[0].name).toBe('Pre-Holiday-Update')
      expect(versions[0].description).toBe('Snapshot before holiday style changes')
      expect(versions[0].createdAt).toBeDefined()
    })

    test('should fail with empty version name', async () => {
      const result = await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          name: '',
          description: 'Test description',
          snapshot: JSON.stringify({ styles: [] })
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should fail with duplicate version name', async () => {
      const versionData = {
        name: 'Duplicate-Name',
        description: 'First version',
        snapshot: JSON.stringify({ styles: [] })
      }

      // Create first version
      await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: versionData
      })

      // Try to create second with same name
      const result = await controller.callInteraction('CreateVersion', {
        user: adminUser,
        payload: {
          name: 'Duplicate-Name',
          description: 'Second version',
          snapshot: JSON.stringify({ styles: [] })
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should fail with unauthorized user', async () => {
      const regularUserId = uuid()
      await system.storage.create('User', {
        id: regularUserId,
        email: 'user@test.com',
        roles: ['user'],
        name: 'Regular User',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('CreateVersion', {
        user: { id: regularUserId },
        payload: {
          name: 'Unauthorized-Version',
          description: 'Should fail',
          snapshot: JSON.stringify({ styles: [] })
        }
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('TC009: Rollback to Version', () => {
    let versionId: string
    let originalStyleId: string

    beforeEach(async () => {
      // Create original style
      originalStyleId = uuid()
      await system.storage.create('Style', {
        id: originalStyleId,
        label: 'Original Style',
        slug: 'original-style',
        description: 'Original description',
        type: 'animation',
        thumbKey: 'original-thumb.jpg',
        priority: 100,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      // Create version snapshot
      versionId = uuid()
      const snapshotData = JSON.stringify({
        styles: [{
          id: originalStyleId,
          label: 'Snapshot Style',
          slug: 'snapshot-style',
          description: 'Snapshot description',
          type: 'surreal',
          thumbKey: 'snapshot-thumb.jpg',
          priority: 200,
          status: 'draft'
        }]
      })

      await system.storage.create('Version', {
        id: versionId,
        name: 'Test-Snapshot',
        description: 'Test snapshot for rollback',
        snapshot: snapshotData,
        createdAt: new Date().toISOString()
      })

      // Modify the style after snapshot
      await system.storage.update('Style', 
        MatchExp.atom({ key: 'id', value: ['=', originalStyleId] }),
        {
          label: 'Modified Style',
          description: 'Modified after snapshot',
          priority: 300,
          updatedAt: new Date().toISOString()
        }
      )
    })

    test('should rollback to version successfully', async () => {
      const result = await controller.callInteraction('RollbackToVersion', {
        user: adminUser,
        payload: {
          versionId
        }
      })

      expect(result.error).toBeUndefined()

      // Verify rollback was successful
      const rolledBackStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', originalStyleId] })
      )

      // Should match snapshot data
      expect(rolledBackStyle.label).toBe('Snapshot Style')
      expect(rolledBackStyle.description).toBe('Snapshot description')
      expect(rolledBackStyle.priority).toBe(200)
    })

    test('should fail with non-existent version', async () => {
      const result = await controller.callInteraction('RollbackToVersion', {
        user: adminUser,
        payload: {
          versionId: 'non-existent-version'
        }
      })

      expect(result.error).toBeDefined()

      // Verify style was not changed
      const unchangedStyle = await system.storage.findOne('Style',
        MatchExp.atom({ key: 'id', value: ['=', originalStyleId] })
      )
      expect(unchangedStyle.label).toBe('Modified Style')
    })

    test('should fail with corrupted snapshot data', async () => {
      const corruptedVersionId = uuid()
      await system.storage.create('Version', {
        id: corruptedVersionId,
        name: 'Corrupted-Snapshot',
        description: 'Corrupted snapshot data',
        snapshot: 'invalid-json-data',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('RollbackToVersion', {
        user: adminUser,
        payload: {
          versionId: corruptedVersionId
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should create automatic rollback point', async () => {
      const versionsBeforeRollback = await system.storage.find('Version', {})
      const countBefore = versionsBeforeRollback.length

      await controller.callInteraction('RollbackToVersion', {
        user: adminUser,
        payload: {
          versionId
        }
      })

      const versionsAfterRollback = await system.storage.find('Version', {})
      const countAfter = versionsAfterRollback.length

      // Should have created one additional version (rollback point)
      expect(countAfter).toBe(countBefore + 1)
    })
  })

  describe('List Versions', () => {
    beforeEach(async () => {
      // Create multiple versions
      const versions = [
        { name: 'Version 1', description: 'First version' },
        { name: 'Version 2', description: 'Second version' },
        { name: 'Version 3', description: 'Third version' }
      ]

      for (const version of versions) {
        await system.storage.create('Version', {
          id: uuid(),
          name: version.name,
          description: version.description,
          snapshot: JSON.stringify({ styles: [] }),
          createdAt: new Date().toISOString()
        })
      }
    })

    test('should list all versions for admin', async () => {
      const result = await controller.callInteraction('ListVersions', {
        user: adminUser,
        payload: {}
      })

      expect(result.error).toBeUndefined()

      const versions = await system.storage.find('Version', {})
      expect(versions.length).toBeGreaterThanOrEqual(3)
    })

    test('should fail for non-admin user', async () => {
      const regularUserId = uuid()
      await system.storage.create('User', {
        id: regularUserId,
        email: 'user@test.com',
        roles: ['user'],
        name: 'Regular User',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('ListVersions', {
        user: { id: regularUserId },
        payload: {}
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('Delete Version', () => {
    let versionId: string

    beforeEach(async () => {
      versionId = uuid()
      await system.storage.create('Version', {
        id: versionId,
        name: 'To-Delete',
        description: 'Version to be deleted',
        snapshot: JSON.stringify({ styles: [] }),
        createdAt: new Date().toISOString()
      })
    })

    test('should delete version successfully', async () => {
      const result = await controller.callInteraction('DeleteVersion', {
        user: adminUser,
        payload: {
          versionId
        }
      })

      expect(result.error).toBeUndefined()

      const deletedVersion = await system.storage.findOne('Version',
        MatchExp.atom({ key: 'id', value: ['=', versionId] })
      )

      expect(deletedVersion).toBeNull()
    })

    test('should fail with non-existent versionId', async () => {
      const result = await controller.callInteraction('DeleteVersion', {
        user: adminUser,
        payload: {
          versionId: 'non-existent-id'
        }
      })

      expect(result.error).toBeDefined()
    })

    test('should fail for non-admin user', async () => {
      const regularUserId = uuid()
      await system.storage.create('User', {
        id: regularUserId,
        email: 'user@test.com',
        roles: ['user'],
        name: 'Regular User',
        createdAt: new Date().toISOString()
      })

      const result = await controller.callInteraction('DeleteVersion', {
        user: { id: regularUserId },
        payload: {
          versionId
        }
      })

      expect(result.error).toBeDefined()
    })
  })
})