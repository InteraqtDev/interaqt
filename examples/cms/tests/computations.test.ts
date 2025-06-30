import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Controller, Database } from 'interaqt'
import { PGlite } from '@electric-sql/pglite'
import { entities, relations, computations, interactions } from '../backend'

describe('Computations Tests', () => {
  let controller: Controller
  let database: Database

  beforeEach(async () => {
    // Create in-memory database
    const db = new PGlite()
    database = new Database(db, {
      entities,
      relations,
      computations,
      interactions
    })
    
    controller = new Controller({
      database,
      entities,
      relations,
      computations,
      interactions
    })
    
    await controller.setup()
  })

  afterEach(async () => {
    await controller.destroy()
  })

  describe('VersionStylesCount Computation', () => {
    it('should count total styles in version correctly', async () => {
      // Create version
      const versionData = {
        id: 'version-count-test',
        name: 'v1.0-count',
        description: 'Version for count testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Initially should have 0 styles
      const initialResult = await controller.findOne('Version', {
        id: 'version-count-test'
      })
      expect(initialResult.error).toBeUndefined()
      expect(initialResult.data.stylesCount).toBe(0)

      // Add styles
      const styleCount = 5
      for (let i = 1; i <= styleCount; i++) {
        const styleData = {
          id: `style-count-${i}`,
          label: `Count Style ${i}`,
          slug: `count-style-${i}`,
          description: `Style ${i} for counting`,
          type: 'animation',
          thumbKey: `count-${i}-thumb.jpg`,
          priority: i,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-count-test'
        }

        await controller.create('Style', styleData)
      }

      // Verify count is updated
      const finalResult = await controller.findOne('Version', {
        id: 'version-count-test'
      })
      expect(finalResult.error).toBeUndefined()
      expect(finalResult.data.stylesCount).toBe(styleCount)
    })

    it('should update count when styles are deleted', async () => {
      // Create version
      const versionData = {
        id: 'version-delete-count',
        name: 'v1.0-delete-count',
        description: 'Version for delete count testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Add 3 styles
      for (let i = 1; i <= 3; i++) {
        const styleData = {
          id: `style-delete-${i}`,
          label: `Delete Style ${i}`,
          slug: `delete-style-${i}`,
          description: `Style ${i} for deletion`,
          type: 'animation',
          thumbKey: `delete-${i}-thumb.jpg`,
          priority: i,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-delete-count'
        }

        await controller.create('Style', styleData)
      }

      // Verify initial count
      let result = await controller.findOne('Version', {
        id: 'version-delete-count'
      })
      expect(result.data.stylesCount).toBe(3)

      // Delete one style
      await controller.delete('Style', 'style-delete-1')

      // Verify count is updated
      result = await controller.findOne('Version', {
        id: 'version-delete-count'
      })
      expect(result.data.stylesCount).toBe(2)
    })
  })

  describe('Status-specific Style Counts', () => {
    it('should count published styles correctly', async () => {
      // Create version
      const versionData = {
        id: 'version-published-count',
        name: 'v1.0-published-count',
        description: 'Version for published count testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Add styles with different statuses
      const statuses = ['draft', 'published', 'published', 'offline']
      for (let i = 0; i < statuses.length; i++) {
        const styleData = {
          id: `style-status-${i + 1}`,
          label: `Status Style ${i + 1}`,
          slug: `status-style-${i + 1}`,
          description: `Style with ${statuses[i]} status`,
          type: 'animation',
          thumbKey: `status-${i + 1}-thumb.jpg`,
          priority: i + 1,
          status: statuses[i],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-published-count'
        }

        await controller.create('Style', styleData)
      }

      // Verify counts
      const result = await controller.findOne('Version', {
        id: 'version-published-count'
      })
      expect(result.error).toBeUndefined()
      expect(result.data.stylesCount).toBe(4)
      expect(result.data.publishedStylesCount).toBe(2)
      expect(result.data.draftStylesCount).toBe(1)
      expect(result.data.offlineStylesCount).toBe(1)
    })

    it('should update status counts when style status changes', async () => {
      // Create version
      const versionData = {
        id: 'version-status-change',
        name: 'v1.0-status-change',
        description: 'Version for status change testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create a draft style
      const styleData = {
        id: 'style-status-change',
        label: 'Status Change Style',
        slug: 'status-change',
        description: 'Style for status change testing',
        type: 'animation',
        thumbKey: 'status-change-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-status-change'
      }
      await controller.create('Style', styleData)

      // Verify initial counts
      let result = await controller.findOne('Version', {
        id: 'version-status-change'
      })
      expect(result.data.draftStylesCount).toBe(1)
      expect(result.data.publishedStylesCount).toBe(0)

      // Change status to published
      await controller.update('Style', 'style-status-change', {
        status: 'published',
        updatedAt: new Date().toISOString()
      })

      // Verify counts are updated
      result = await controller.findOne('Version', {
        id: 'version-status-change'
      })
      expect(result.data.draftStylesCount).toBe(0)
      expect(result.data.publishedStylesCount).toBe(1)
    })
  })

  describe('User Counts', () => {
    it('should count styles created by user', async () => {
      // Create user
      const userData = {
        id: 'user-style-count',
        username: 'stylecounter',
        email: 'stylecounter@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create version
      const versionData = {
        id: 'version-user-styles',
        name: 'v1.0-user-styles',
        description: 'Version for user style counting',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Initially should have 0 styles
      let userResult = await controller.findOne('User', {
        id: 'user-style-count'
      })
      expect(userResult.data.stylesCount).toBe(0)

      // Create styles by user
      const styleCount = 3
      for (let i = 1; i <= styleCount; i++) {
        const styleData = {
          id: `user-style-${i}`,
          label: `User Style ${i}`,
          slug: `user-style-${i}`,
          description: `Style ${i} by user`,
          type: 'animation',
          thumbKey: `user-${i}-thumb.jpg`,
          priority: i,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-user-styles',
          creator: 'user-style-count'
        }

        await controller.create('Style', styleData)
      }

      // Verify user style count
      userResult = await controller.findOne('User', {
        id: 'user-style-count'
      })
      expect(userResult.data.stylesCount).toBe(styleCount)
    })

    it('should count versions created by user', async () => {
      // Create user
      const userData = {
        id: 'user-version-count',
        username: 'versioncounter',
        email: 'versioncounter@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Initially should have 0 versions
      let userResult = await controller.findOne('User', {
        id: 'user-version-count'
      })
      expect(userResult.data.versionsCount).toBe(0)

      // Create versions by user
      const versionCount = 2
      for (let i = 1; i <= versionCount; i++) {
        const versionData = {
          id: `user-version-${i}`,
          name: `v1.${i}`,
          description: `Version ${i} by user`,
          status: 'draft',
          createdAt: new Date().toISOString(),
          publishedAt: null,
          creator: 'user-version-count'
        }

        await controller.create('Version', versionData)
      }

      // Verify user version count
      userResult = await controller.findOne('User', {
        id: 'user-version-count'
      })
      expect(userResult.data.versionsCount).toBe(versionCount)
    })
  })

  describe('Priority-related Computations', () => {
    it('should calculate next style priority correctly', async () => {
      // Create version
      const versionData = {
        id: 'version-priority-test',
        name: 'v1.0-priority',
        description: 'Version for priority testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Initially should return default value
      let result = await controller.findOne('Version', {
        id: 'version-priority-test'
      })
      expect(result.data.nextStylePriority).toBe(0)

      // Add styles with different priorities
      const priorities = [1, 3, 5, 2]
      for (let i = 0; i < priorities.length; i++) {
        const styleData = {
          id: `style-priority-${i + 1}`,
          label: `Priority Style ${i + 1}`,
          slug: `priority-style-${i + 1}`,
          description: `Style with priority ${priorities[i]}`,
          type: 'animation',
          thumbKey: `priority-${i + 1}-thumb.jpg`,
          priority: priorities[i],
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-priority-test'
        }

        await controller.create('Style', styleData)
      }

      // Should return max priority (5) for next priority calculation
      result = await controller.findOne('Version', {
        id: 'version-priority-test'
      })
      expect(result.data.nextStylePriority).toBe(5)
      expect(result.data.maxPriority).toBe(5)
    })
  })

  describe('Version Publishing Readiness', () => {
    it('should determine if version can be published', async () => {
      // Create version
      const versionData = {
        id: 'version-publish-ready',
        name: 'v1.0-publish-ready',
        description: 'Version for publish readiness testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Initially should not be publishable (no published styles)
      let result = await controller.findOne('Version', {
        id: 'version-publish-ready'
      })
      expect(result.data.canBePublished).toBe(false)

      // Add a draft style
      const draftStyleData = {
        id: 'style-draft-only',
        label: 'Draft Only Style',
        slug: 'draft-only',
        description: 'Draft style',
        type: 'animation',
        thumbKey: 'draft-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-publish-ready'
      }
      await controller.create('Style', draftStyleData)

      // Still should not be publishable
      result = await controller.findOne('Version', {
        id: 'version-publish-ready'
      })
      expect(result.data.canBePublished).toBe(false)

      // Add a published style
      const publishedStyleData = {
        id: 'style-published',
        label: 'Published Style',
        slug: 'published',
        description: 'Published style',
        type: 'animation',
        thumbKey: 'published-thumb.jpg',
        priority: 2,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-publish-ready'
      }
      await controller.create('Style', publishedStyleData)

      // Now should be publishable
      result = await controller.findOne('Version', {
        id: 'version-publish-ready'
      })
      expect(result.data.canBePublished).toBe(true)
    })
  })

  describe('Computation Reactivity', () => {
    it('should update computed values automatically on data changes', async () => {
      // Create version
      const versionData = {
        id: 'version-reactive',
        name: 'v1.0-reactive',
        description: 'Version for reactivity testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Add initial style
      const styleData = {
        id: 'style-reactive',
        label: 'Reactive Style',
        slug: 'reactive',
        description: 'Style for reactivity testing',
        type: 'animation',
        thumbKey: 'reactive-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-reactive'
      }
      await controller.create('Style', styleData)

      // Check initial state
      let result = await controller.findOne('Version', {
        id: 'version-reactive'
      })
      expect(result.data.stylesCount).toBe(1)
      expect(result.data.draftStylesCount).toBe(1)
      expect(result.data.publishedStylesCount).toBe(0)
      expect(result.data.canBePublished).toBe(false)

      // Change style status to published
      await controller.update('Style', 'style-reactive', {
        status: 'published',
        updatedAt: new Date().toISOString()
      })

      // Verify all related computations are updated
      result = await controller.findOne('Version', {
        id: 'version-reactive'
      })
      expect(result.data.stylesCount).toBe(1)
      expect(result.data.draftStylesCount).toBe(0)
      expect(result.data.publishedStylesCount).toBe(1)
      expect(result.data.canBePublished).toBe(true)
    })

    it('should handle multiple simultaneous changes correctly', async () => {
      // Create version
      const versionData = {
        id: 'version-multi-change',
        name: 'v1.0-multi-change',
        description: 'Version for multi-change testing',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Add multiple styles in different statuses
      const styles = [
        { id: 'style-1', status: 'draft' },
        { id: 'style-2', status: 'draft' },
        { id: 'style-3', status: 'published' }
      ]

      for (const style of styles) {
        const styleData = {
          id: style.id,
          label: `Multi Style ${style.id}`,
          slug: style.id,
          description: `Style ${style.id} for multi-change testing`,
          type: 'animation',
          thumbKey: `${style.id}-thumb.jpg`,
          priority: parseInt(style.id.split('-')[1]),
          status: style.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-multi-change'
        }

        await controller.create('Style', styleData)
      }

      // Verify initial state
      let result = await controller.findOne('Version', {
        id: 'version-multi-change'
      })
      expect(result.data.stylesCount).toBe(3)
      expect(result.data.draftStylesCount).toBe(2)
      expect(result.data.publishedStylesCount).toBe(1)

      // Make multiple changes: publish one draft, offline the published one
      await controller.update('Style', 'style-1', {
        status: 'published',
        updatedAt: new Date().toISOString()
      })

      await controller.update('Style', 'style-3', {
        status: 'offline',
        updatedAt: new Date().toISOString()
      })

      // Verify final state
      result = await controller.findOne('Version', {
        id: 'version-multi-change'
      })
      expect(result.data.stylesCount).toBe(3)
      expect(result.data.draftStylesCount).toBe(1)
      expect(result.data.publishedStylesCount).toBe(1)
      expect(result.data.offlineStylesCount).toBe(1)
    })
  })
})