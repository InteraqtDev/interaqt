import { describe, it, expect, beforeEach } from 'vitest'
import { controller } from '../index'
import { Style, Version, User } from '../entities'

describe('Entity Tests', () => {
  beforeEach(async () => {
    await controller.setup()
    await controller.clearData()
  })

  describe('Style Entity', () => {
    it('should create a style with all required properties', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        description: 'Japanese comic art style',
        type: 'animation',
        thumb_key: 's3://bucket/manga-thumb.jpg',
        priority: 1,
        status: 'draft'
      })

      expect(result.error).toBeFalsy()
      expect(result.data).toMatchObject({
        label: 'Manga',
        slug: 'manga',
        description: 'Japanese comic art style',
        type: 'animation',
        thumb_key: 's3://bucket/manga-thumb.jpg',
        priority: 1,
        status: 'draft'
      })
      expect(result.data.id).toBeDefined()
      expect(result.data.created_at).toBeDefined()
      expect(result.data.updated_at).toBeDefined()
    })

    it('should not create style with duplicate slug', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      const result = await controller.callInteraction('CreateStyle', {
        label: 'Another Manga',
        slug: 'manga',
        type: 'animation',
        priority: 2
      })

      expect(result.error).toBeTruthy()
    })

    it('should create style with default draft status', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      expect(result.error).toBeFalsy()
      expect(result.data.status).toBe('draft')
    })

    it('should update style properties', async () => {
      const createResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      const updateResult = await controller.callInteraction('UpdateStyle', {
        id: createResult.data.id,
        label: 'Updated Manga',
        description: 'Updated description'
      })

      expect(updateResult.error).toBeFalsy()
      expect(updateResult.data.label).toBe('Updated Manga')
      expect(updateResult.data.description).toBe('Updated description')
      expect(updateResult.data.updated_at).not.toBe(createResult.data.updated_at)
    })

    it('should update style status', async () => {
      const createResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      const updateResult = await controller.callInteraction('UpdateStyleStatus', {
        id: createResult.data.id,
        status: 'published'
      })

      expect(updateResult.error).toBeFalsy()
      expect(updateResult.data.status).toBe('published')
    })

    it('should delete style', async () => {
      const createResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      const deleteResult = await controller.callInteraction('DeleteStyle', {
        id: createResult.data.id
      }, { user: { role: 'admin' } })

      expect(deleteResult.error).toBeFalsy()

      const styles = await controller.getRecords(Style)
      expect(styles).toHaveLength(0)
    })
  })

  describe('Version Entity', () => {
    it('should create a version', async () => {
      const result = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0',
        description: 'Initial release'
      }, { user: { id: 'user-123', role: 'admin' } })

      expect(result.error).toBeFalsy()
      expect(result.data).toMatchObject({
        version_number: 'v1.0.0',
        description: 'Initial release',
        is_current: true,
        created_by: 'user-123'
      })
      expect(result.data.id).toBeDefined()
      expect(result.data.created_at).toBeDefined()
    })

    it('should mark only one version as current', async () => {
      await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      await controller.callInteraction('CreateVersion', {
        version_number: 'v1.1.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      const versions = await controller.getRecords(Version)
      const currentVersions = versions.filter(v => v.is_current)
      expect(currentVersions).toHaveLength(1)
      expect(currentVersions[0].version_number).toBe('v1.1.0')
    })
  })

  describe('User Entity', () => {
    it('should create a user', async () => {
      const result = await controller.callInteraction('CreateUser', {
        username: 'admin',
        role: 'admin'
      }, { user: { role: 'admin' } })

      expect(result.error).toBeFalsy()
      expect(result.data).toMatchObject({
        username: 'admin',
        role: 'admin'
      })
      expect(result.data.id).toBeDefined()
      expect(result.data.created_at).toBeDefined()
    })
  })
})