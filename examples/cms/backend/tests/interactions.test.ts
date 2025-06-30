import { describe, it, expect, beforeEach } from 'vitest'
import { controller } from '../index'
import { Style, Version, User } from '../entities'

describe('Interactions Tests', () => {
  beforeEach(async () => {
    await controller.setup()
    await controller.clearData()
  })

  describe('Style CRUD Interactions', () => {
    describe('CreateStyle', () => {
      it('should create style successfully with editor role', async () => {
        const result = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          description: 'Japanese comic art style',
          type: 'animation',
          thumb_key: 's3://bucket/manga-thumb.jpg',
          priority: 1,
          status: 'draft'
        }, { user: { role: 'editor' } })

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
      })

      it('should fail with viewer role', async () => {
        const result = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'viewer' } })

        expect(result.error).toBeTruthy()
      })

      it('should fail without user context', async () => {
        const result = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        })

        expect(result.error).toBeTruthy()
      })

      it('should fail with missing required fields', async () => {
        const result = await controller.callInteraction('CreateStyle', {
          label: 'Manga'
        }, { user: { role: 'editor' } })

        expect(result.error).toBeTruthy()
      })
    })

    describe('UpdateStyle', () => {
      it('should update style successfully with editor role', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const updateResult = await controller.callInteraction('UpdateStyle', {
          id: createResult.data.id,
          label: 'Updated Manga',
          description: 'Updated description'
        }, { user: { role: 'editor' } })

        expect(updateResult.error).toBeFalsy()
        expect(updateResult.data.label).toBe('Updated Manga')
        expect(updateResult.data.description).toBe('Updated description')
        expect(updateResult.data.updated_at).not.toBe(createResult.data.updated_at)
      })

      it('should fail with viewer role', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const updateResult = await controller.callInteraction('UpdateStyle', {
          id: createResult.data.id,
          label: 'Updated Manga'
        }, { user: { role: 'viewer' } })

        expect(updateResult.error).toBeTruthy()
      })
    })

    describe('UpdateStyleStatus', () => {
      it('should update status successfully', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const updateResult = await controller.callInteraction('UpdateStyleStatus', {
          id: createResult.data.id,
          status: 'published'
        }, { user: { role: 'editor' } })

        expect(updateResult.error).toBeFalsy()
        expect(updateResult.data.status).toBe('published')
      })

      it('should validate status values', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const updateResult = await controller.callInteraction('UpdateStyleStatus', {
          id: createResult.data.id,
          status: 'invalid_status'
        }, { user: { role: 'editor' } })

        expect(updateResult.error).toBeTruthy()
      })
    })

    describe('DeleteStyle', () => {
      it('should delete style successfully with admin role', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const deleteResult = await controller.callInteraction('DeleteStyle', {
          id: createResult.data.id
        }, { user: { role: 'admin' } })

        expect(deleteResult.error).toBeFalsy()

        const styles = await controller.getRecords(Style)
        expect(styles).toHaveLength(0)
      })

      it('should fail with editor role', async () => {
        const createResult = await controller.callInteraction('CreateStyle', {
          label: 'Manga',
          slug: 'manga',
          type: 'animation',
          priority: 1
        }, { user: { role: 'editor' } })

        const deleteResult = await controller.callInteraction('DeleteStyle', {
          id: createResult.data.id
        }, { user: { role: 'editor' } })

        expect(deleteResult.error).toBeTruthy()
      })
    })
  })

  describe('Style Status Workflow Interactions', () => {
    it('should publish style from draft', async () => {
      const createResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'draft'
      }, { user: { role: 'editor' } })

      const publishResult = await controller.callInteraction('PublishStyle', {
        id: createResult.data.id
      }, { user: { role: 'editor' } })

      expect(publishResult.error).toBeFalsy()
      expect(publishResult.data.status).toBe('published')
    })

    it('should take style offline', async () => {
      const createResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'published'
      }, { user: { role: 'editor' } })

      const offlineResult = await controller.callInteraction('TakeStyleOffline', {
        id: createResult.data.id
      }, { user: { role: 'editor' } })

      expect(offlineResult.error).toBeFalsy()
      expect(offlineResult.data.status).toBe('offline')
    })
  })

  describe('Priority and Sorting Interactions', () => {
    it('should reorder styles correctly', async () => {
      const style1 = await controller.callInteraction('CreateStyle', {
        label: 'Style1',
        slug: 'style1',
        type: 'animation',
        priority: 1
      }, { user: { role: 'editor' } })

      const style2 = await controller.callInteraction('CreateStyle', {
        label: 'Style2',
        slug: 'style2',
        type: 'animation',
        priority: 2
      }, { user: { role: 'editor' } })

      const style3 = await controller.callInteraction('CreateStyle', {
        label: 'Style3',
        slug: 'style3',
        type: 'animation',
        priority: 3
      }, { user: { role: 'editor' } })

      const reorderResult = await controller.callInteraction('ReorderStyles', {
        style_id: style2.data.id,
        new_position: 3
      }, { user: { role: 'editor' } })

      expect(reorderResult.error).toBeFalsy()
    })

    it('should fail reordering with viewer role', async () => {
      const style1 = await controller.callInteraction('CreateStyle', {
        label: 'Style1',
        slug: 'style1',
        type: 'animation',
        priority: 1
      }, { user: { role: 'editor' } })

      const reorderResult = await controller.callInteraction('ReorderStyles', {
        style_id: style1.data.id,
        new_position: 2
      }, { user: { role: 'viewer' } })

      expect(reorderResult.error).toBeTruthy()
    })
  })

  describe('Bulk Operations', () => {
    it('should bulk create styles with admin role', async () => {
      const bulkData = {
        styles: [
          {
            label: 'Style1',
            slug: 'style1',
            type: 'animation',
            priority: 1
          },
          {
            label: 'Style2',
            slug: 'style2',
            type: 'surreal',
            priority: 2
          }
        ]
      }

      const result = await controller.callInteraction('BulkCreateStyles', bulkData, {
        user: { role: 'admin' }
      })

      expect(result.error).toBeFalsy()

      const styles = await controller.getRecords(Style)
      expect(styles).toHaveLength(2)
    })

    it('should fail bulk create with editor role', async () => {
      const bulkData = {
        styles: [
          {
            label: 'Style1',
            slug: 'style1',
            type: 'animation',
            priority: 1
          }
        ]
      }

      const result = await controller.callInteraction('BulkCreateStyles', bulkData, {
        user: { role: 'editor' }
      })

      expect(result.error).toBeTruthy()
    })
  })

  describe('Version Management Interactions', () => {
    describe('CreateVersion', () => {
      it('should create version with admin role', async () => {
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
      })

      it('should fail with editor role', async () => {
        const result = await controller.callInteraction('CreateVersion', {
          version_number: 'v1.0.0'
        }, { user: { role: 'editor' } })

        expect(result.error).toBeTruthy()
      })

      it('should set new version as current and unset previous', async () => {
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

    describe('RollbackToVersion', () => {
      it('should rollback to previous version with admin role', async () => {
        const v1Result = await controller.callInteraction('CreateVersion', {
          version_number: 'v1.0.0'
        }, { user: { id: 'user-123', role: 'admin' } })

        await controller.callInteraction('CreateVersion', {
          version_number: 'v1.1.0'
        }, { user: { id: 'user-123', role: 'admin' } })

        const rollbackResult = await controller.callInteraction('RollbackToVersion', {
          version_id: v1Result.data.id
        }, { user: { role: 'admin' } })

        expect(rollbackResult.error).toBeFalsy()
      })

      it('should fail with editor role', async () => {
        const v1Result = await controller.callInteraction('CreateVersion', {
          version_number: 'v1.0.0'
        }, { user: { id: 'user-123', role: 'admin' } })

        const rollbackResult = await controller.callInteraction('RollbackToVersion', {
          version_id: v1Result.data.id
        }, { user: { role: 'editor' } })

        expect(rollbackResult.error).toBeTruthy()
      })
    })
  })

  describe('User Management Interactions', () => {
    it('should create user with admin role', async () => {
      const result = await controller.callInteraction('CreateUser', {
        username: 'newuser',
        role: 'editor'
      }, { user: { role: 'admin' } })

      expect(result.error).toBeFalsy()
      expect(result.data).toMatchObject({
        username: 'newuser',
        role: 'editor'
      })
    })

    it('should fail creating user with editor role', async () => {
      const result = await controller.callInteraction('CreateUser', {
        username: 'newuser',
        role: 'editor'
      }, { user: { role: 'editor' } })

      expect(result.error).toBeTruthy()
    })
  })

  describe('Data Validation', () => {
    it('should validate required fields in CreateStyle', async () => {
      const result = await controller.callInteraction('CreateStyle', {
        label: 'Manga'
      }, { user: { role: 'editor' } })

      expect(result.error).toBeTruthy()
    })

    it('should validate slug uniqueness', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      }, { user: { role: 'editor' } })

      const result = await controller.callInteraction('CreateStyle', {
        label: 'Another Manga',
        slug: 'manga',
        type: 'animation',
        priority: 2
      }, { user: { role: 'editor' } })

      expect(result.error).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent style update gracefully', async () => {
      const result = await controller.callInteraction('UpdateStyle', {
        id: 'non-existent-id',
        label: 'Updated'
      }, { user: { role: 'editor' } })

      expect(result.error).toBeTruthy()
    })

    it('should handle non-existent style delete gracefully', async () => {
      const result = await controller.callInteraction('DeleteStyle', {
        id: 'non-existent-id'
      }, { user: { role: 'admin' } })

      expect(result.error).toBeTruthy()
    })

    it('should handle invalid version rollback gracefully', async () => {
      const result = await controller.callInteraction('RollbackToVersion', {
        version_id: 'non-existent-version'
      }, { user: { role: 'admin' } })

      expect(result.error).toBeTruthy()
    })
  })
})