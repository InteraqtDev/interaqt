import { describe, it, expect, beforeEach } from 'vitest'
import { controller } from '../index'
import { Style, Version, User } from '../entities'
import { StyleVersionRelation, UserVersionRelation } from '../relations'

describe('Relations Tests', () => {
  beforeEach(async () => {
    await controller.setup()
    await controller.clearData()
  })

  describe('StyleVersionRelation', () => {
    it('should create relation between style and version', async () => {
      const styleResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'published'
      })

      const versionResult = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0',
        description: 'Initial release'
      }, { user: { id: 'user-123', role: 'admin' } })

      await controller.addRelation(StyleVersionRelation, styleResult.data.id, versionResult.data.id, {
        snapshot_data: {
          label: styleResult.data.label,
          slug: styleResult.data.slug,
          type: styleResult.data.type,
          priority: styleResult.data.priority,
          status: styleResult.data.status
        },
        created_at: new Date().toISOString()
      })

      const styleVersions = await controller.getRelatedRecords(styleResult.data.id, StyleVersionRelation, 'target')
      expect(styleVersions).toHaveLength(1)
      expect(styleVersions[0].version_number).toBe('v1.0.0')

      const versionStyles = await controller.getRelatedRecords(versionResult.data.id, StyleVersionRelation, 'source')
      expect(versionStyles).toHaveLength(1)
      expect(versionStyles[0].slug).toBe('manga')
    })

    it('should store snapshot data in relation', async () => {
      const styleResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'published'
      })

      const versionResult = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      const snapshotData = {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'published'
      }

      await controller.addRelation(StyleVersionRelation, styleResult.data.id, versionResult.data.id, {
        snapshot_data: snapshotData,
        created_at: new Date().toISOString()
      })

      const relationData = await controller.getRelationData(StyleVersionRelation, styleResult.data.id, versionResult.data.id)
      expect(relationData.snapshot_data).toEqual(snapshotData)
    })
  })

  describe('UserVersionRelation', () => {
    it('should relate user to created versions', async () => {
      const userResult = await controller.callInteraction('CreateUser', {
        username: 'admin',
        role: 'admin'
      }, { user: { role: 'admin' } })

      const versionResult = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0',
        description: 'Initial release'
      }, { user: { id: userResult.data.id, role: 'admin' } })

      await controller.addRelation(UserVersionRelation, userResult.data.id, versionResult.data.id)

      const userVersions = await controller.getRelatedRecords(userResult.data.id, UserVersionRelation, 'target')
      expect(userVersions).toHaveLength(1)
      expect(userVersions[0].version_number).toBe('v1.0.0')

      const versionCreator = await controller.getRelatedRecords(versionResult.data.id, UserVersionRelation, 'source')
      expect(versionCreator).toHaveLength(1)
      expect(versionCreator[0].username).toBe('admin')
    })
  })

  describe('Computed Properties via Relations', () => {
    it('should compute styles count for version', async () => {
      const versionResult = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      const style1 = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'published'
      })

      const style2 = await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 2,
        status: 'published'
      })

      await controller.addRelation(StyleVersionRelation, style1.data.id, versionResult.data.id, {
        snapshot_data: style1.data,
        created_at: new Date().toISOString()
      })

      await controller.addRelation(StyleVersionRelation, style2.data.id, versionResult.data.id, {
        snapshot_data: style2.data,
        created_at: new Date().toISOString()
      })

      const version = await controller.getRecord(Version, versionResult.data.id)
      expect(version.styles_count).toBe(2)
    })
  })
})