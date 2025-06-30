import { describe, it, expect, beforeEach } from 'vitest'
import { controller } from '../index'
import {
  TotalStylesCount,
  PublishedStylesCount,
  DraftStylesCount,
  OfflineStylesCount,
  StylesByTypeCount,
  MaxStylePriority,
  MinStylePriority,
  CurrentVersionCount
} from '../computations'

describe('Computations Tests', () => {
  beforeEach(async () => {
    await controller.setup()
    await controller.clearData()
  })

  describe('Style Count Computations', () => {
    it('should count total styles', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'draft'
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 2,
        status: 'published'
      })

      const totalCount = await controller.getComputedValue(TotalStylesCount)
      expect(totalCount).toBe(2)
    })

    it('should count published styles only', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'draft'
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 2,
        status: 'published'
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Abstract',
        slug: 'abstract',
        type: 'abstract',
        priority: 3,
        status: 'published'
      })

      const publishedCount = await controller.getComputedValue(PublishedStylesCount)
      expect(publishedCount).toBe(2)
    })

    it('should count draft styles only', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'draft'
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 2,
        status: 'published'
      })

      const draftCount = await controller.getComputedValue(DraftStylesCount)
      expect(draftCount).toBe(1)
    })

    it('should count offline styles only', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'offline'
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 2,
        status: 'published'
      })

      const offlineCount = await controller.getComputedValue(OfflineStylesCount)
      expect(offlineCount).toBe(1)
    })

    it('should reactively update counts when status changes', async () => {
      const styleResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1,
        status: 'draft'
      })

      let draftCount = await controller.getComputedValue(DraftStylesCount)
      let publishedCount = await controller.getComputedValue(PublishedStylesCount)
      expect(draftCount).toBe(1)
      expect(publishedCount).toBe(0)

      await controller.callInteraction('PublishStyle', {
        id: styleResult.data.id
      })

      draftCount = await controller.getComputedValue(DraftStylesCount)
      publishedCount = await controller.getComputedValue(PublishedStylesCount)
      expect(draftCount).toBe(0)
      expect(publishedCount).toBe(1)
    })
  })

  describe('Styles by Type Count', () => {
    it('should count styles grouped by type', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Anime',
        slug: 'anime',
        type: 'animation',
        priority: 2
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Surreal',
        slug: 'surreal',
        type: 'surreal',
        priority: 3
      })

      const typeCount = await controller.getComputedValue(StylesByTypeCount)
      expect(typeCount).toEqual({
        animation: 2,
        surreal: 1
      })
    })

    it('should reactively update type counts', async () => {
      const styleResult = await controller.callInteraction('CreateStyle', {
        label: 'Manga',
        slug: 'manga',
        type: 'animation',
        priority: 1
      })

      let typeCount = await controller.getComputedValue(StylesByTypeCount)
      expect(typeCount.animation).toBe(1)
      expect(typeCount.surreal).toBeUndefined()

      await controller.callInteraction('UpdateStyle', {
        id: styleResult.data.id,
        type: 'surreal'
      })

      typeCount = await controller.getComputedValue(StylesByTypeCount)
      expect(typeCount.animation).toBeUndefined()
      expect(typeCount.surreal).toBe(1)
    })
  })

  describe('Priority Computations', () => {
    it('should compute max priority', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Style1',
        slug: 'style1',
        type: 'animation',
        priority: 1
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Style2',
        slug: 'style2',
        type: 'animation',
        priority: 5
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Style3',
        slug: 'style3',
        type: 'animation',
        priority: 3
      })

      const maxPriority = await controller.getComputedValue(MaxStylePriority)
      expect(maxPriority).toBe(5)
    })

    it('should compute min priority', async () => {
      await controller.callInteraction('CreateStyle', {
        label: 'Style1',
        slug: 'style1',
        type: 'animation',
        priority: 1
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Style2',
        slug: 'style2',
        type: 'animation',
        priority: 5
      })

      await controller.callInteraction('CreateStyle', {
        label: 'Style3',
        slug: 'style3',
        type: 'animation',
        priority: 3
      })

      const minPriority = await controller.getComputedValue(MinStylePriority)
      expect(minPriority).toBe(1)
    })

    it('should reactively update priority computations', async () => {
      const styleResult = await controller.callInteraction('CreateStyle', {
        label: 'Style1',
        slug: 'style1',
        type: 'animation',
        priority: 1
      })

      let maxPriority = await controller.getComputedValue(MaxStylePriority)
      expect(maxPriority).toBe(1)

      await controller.callInteraction('UpdateStyle', {
        id: styleResult.data.id,
        priority: 10
      })

      maxPriority = await controller.getComputedValue(MaxStylePriority)
      expect(maxPriority).toBe(10)
    })
  })

  describe('Version Computations', () => {
    it('should count current versions', async () => {
      await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      await controller.callInteraction('CreateVersion', {
        version_number: 'v1.1.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      const currentVersionCount = await controller.getComputedValue(CurrentVersionCount)
      expect(currentVersionCount).toBe(1)
    })

    it('should update current version count reactively', async () => {
      const v1Result = await controller.callInteraction('CreateVersion', {
        version_number: 'v1.0.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      let currentCount = await controller.getComputedValue(CurrentVersionCount)
      expect(currentCount).toBe(1)

      await controller.callInteraction('CreateVersion', {
        version_number: 'v1.1.0'
      }, { user: { id: 'user-123', role: 'admin' } })

      currentCount = await controller.getComputedValue(CurrentVersionCount)
      expect(currentCount).toBe(1)
    })
  })

  describe('Incremental Computation Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        await controller.callInteraction('CreateStyle', {
          label: `Style ${i}`,
          slug: `style-${i}`,
          type: i % 2 === 0 ? 'animation' : 'surreal',
          priority: i + 1,
          status: i % 3 === 0 ? 'published' : 'draft'
        })
      }

      const totalCount = await controller.getComputedValue(TotalStylesCount)
      const publishedCount = await controller.getComputedValue(PublishedStylesCount)
      const typeCount = await controller.getComputedValue(StylesByTypeCount)

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(totalCount).toBe(100)
      expect(publishedCount).toBe(34)
      expect(typeCount.animation).toBe(50)
      expect(typeCount.surreal).toBe(50)
      expect(duration).toBeLessThan(10000)
    })
  })
})