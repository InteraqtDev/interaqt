import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Controller, Database } from 'interaqt'
import { PGlite } from '@electric-sql/pglite'
import { entities, relations, computations, interactions } from '../backend'

describe('Interactions Tests', () => {
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

  describe('CreateStyleInteraction', () => {
    it('should create style successfully with admin permissions (TC001)', async () => {
      // Create admin user
      const adminUser = {
        id: 'admin-001',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      // Create draft version
      const versionData = {
        id: 'version-001',
        name: 'v1.0',
        description: 'Test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create style via interaction
      const payload = {
        versionId: 'version-001',
        label: 'Manga Style',
        slug: 'manga',
        description: '日式漫画风格',
        type: 'animation',
        thumbKey: 'styles/manga-thumb.jpg'
      }

      const result = await controller.call('CreateStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()
      expect(result.data).toBeDefined()
      
      // Verify style was created with correct properties
      const createdStyle = await controller.findOne('Style', {
        slug: 'manga'
      })
      expect(createdStyle.error).toBeUndefined()
      expect(createdStyle.data.label).toBe('Manga Style')
      expect(createdStyle.data.status).toBe('draft')
      expect(createdStyle.data.version).toBe('version-001')
    })

    it('should create style successfully with editor permissions', async () => {
      // Create editor user
      const editorUser = {
        id: 'editor-001',
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      // Create draft version
      const versionData = {
        id: 'version-editor',
        name: 'v1.0-editor',
        description: 'Editor test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const payload = {
        versionId: 'version-editor',
        label: 'Editor Style',
        slug: 'editor-style',
        description: 'Style created by editor',
        type: 'animation',
        thumbKey: 'styles/editor-thumb.jpg'
      }

      const result = await controller.call('CreateStyleInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeUndefined()
    })

    it('should reject style creation with viewer permissions', async () => {
      // Create viewer user
      const viewerUser = {
        id: 'viewer-001',
        username: 'viewer',
        email: 'viewer@example.com',
        role: 'viewer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', viewerUser)

      // Create draft version
      const versionData = {
        id: 'version-viewer',
        name: 'v1.0-viewer',
        description: 'Viewer test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const payload = {
        versionId: 'version-viewer',
        label: 'Viewer Style',
        slug: 'viewer-style',
        description: 'Style creation attempt by viewer',
        type: 'animation',
        thumbKey: 'styles/viewer-thumb.jpg'
      }

      const result = await controller.call('CreateStyleInteraction', payload, {
        user: viewerUser
      })

      expect(result.error).toBeDefined()
    })

    it('should reject style creation in published version', async () => {
      // Create admin user
      const adminUser = {
        id: 'admin-published',
        username: 'admin-published',
        email: 'admin-published@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      // Create published version
      const versionData = {
        id: 'version-published',
        name: 'v1.0-published',
        description: 'Published version',
        status: 'published',
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString()
      }
      await controller.create('Version', versionData)

      const payload = {
        versionId: 'version-published',
        label: 'Published Version Style',
        slug: 'published-version-style',
        description: 'Style in published version',
        type: 'animation',
        thumbKey: 'styles/published-thumb.jpg'
      }

      const result = await controller.call('CreateStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('UpdateStyleInteraction', () => {
    it('should update style successfully by admin (TC002)', async () => {
      // Setup data
      const adminUser = {
        id: 'admin-update',
        username: 'admin-update',
        email: 'admin-update@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const versionData = {
        id: 'version-update',
        name: 'v1.0-update',
        description: 'Update test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-update-test',
        label: 'Original Style',
        slug: 'original',
        description: 'Original description',
        type: 'animation',
        thumbKey: 'original-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-update'
      }
      await controller.create('Style', styleData)

      // Update style
      const payload = {
        styleId: 'style-update-test',
        label: 'Updated Manga Style',
        slug: 'original',
        description: '更新的日式漫画风格描述',
        type: 'animation',
        thumbKey: 'original-thumb.jpg'
      }

      const result = await controller.call('UpdateStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()

      // Verify update
      const updatedStyle = await controller.findOne('Style', {
        id: 'style-update-test'
      })
      expect(updatedStyle.data.label).toBe('Updated Manga Style')
      expect(updatedStyle.data.description).toBe('更新的日式漫画风格描述')
    })

    it('should reject update of published style by editor', async () => {
      // Setup data
      const editorUser = {
        id: 'editor-update',
        username: 'editor-update',
        email: 'editor-update@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const versionData = {
        id: 'version-published-update',
        name: 'v1.0-published-update',
        description: 'Published update test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-published-update',
        label: 'Published Style',
        slug: 'published-style',
        description: 'Published style description',
        type: 'animation',
        thumbKey: 'published-thumb.jpg',
        priority: 1,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-published-update'
      }
      await controller.create('Style', styleData)

      const payload = {
        styleId: 'style-published-update',
        label: 'Editor Updated Style',
        slug: 'published-style',
        description: 'Editor attempted update',
        type: 'animation',
        thumbKey: 'published-thumb.jpg'
      }

      const result = await controller.call('UpdateStyleInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('PublishStyleInteraction', () => {
    it('should publish style successfully by admin (TC003)', async () => {
      // Setup data
      const adminUser = {
        id: 'admin-publish',
        username: 'admin-publish',
        email: 'admin-publish@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const versionData = {
        id: 'version-publish',
        name: 'v1.0-publish',
        description: 'Publish test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-publish-test',
        label: 'Draft Style',
        slug: 'draft-style',
        description: 'Style to be published',
        type: 'animation',
        thumbKey: 'draft-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-publish'
      }
      await controller.create('Style', styleData)

      // Publish style
      const payload = {
        styleId: 'style-publish-test'
      }

      const result = await controller.call('PublishStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()

      // Verify style is published
      const publishedStyle = await controller.findOne('Style', {
        id: 'style-publish-test'
      })
      expect(publishedStyle.data.status).toBe('published')

      // Verify version published count increased
      const version = await controller.findOne('Version', {
        id: 'version-publish'
      })
      expect(version.data.publishedStylesCount).toBe(1)
    })

    it('should reject publish by editor', async () => {
      // Setup data
      const editorUser = {
        id: 'editor-publish',
        username: 'editor-publish',
        email: 'editor-publish@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const versionData = {
        id: 'version-editor-publish',
        name: 'v1.0-editor-publish',
        description: 'Editor publish test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-editor-publish',
        label: 'Editor Draft Style',
        slug: 'editor-draft',
        description: 'Editor draft style',
        type: 'animation',
        thumbKey: 'editor-draft-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-editor-publish'
      }
      await controller.create('Style', styleData)

      const payload = {
        styleId: 'style-editor-publish'
      }

      const result = await controller.call('PublishStyleInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeDefined()
    })

    it('should reject duplicate publish', async () => {
      // Setup data
      const adminUser = {
        id: 'admin-duplicate-publish',
        username: 'admin-duplicate-publish',
        email: 'admin-duplicate-publish@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const versionData = {
        id: 'version-duplicate-publish',
        name: 'v1.0-duplicate-publish',
        description: 'Duplicate publish test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-already-published',
        label: 'Already Published Style',
        slug: 'already-published',
        description: 'Already published style',
        type: 'animation',
        thumbKey: 'already-published-thumb.jpg',
        priority: 1,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-duplicate-publish'
      }
      await controller.create('Style', styleData)

      const payload = {
        styleId: 'style-already-published'
      }

      const result = await controller.call('PublishStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('OfflineStyleInteraction', () => {
    it('should offline style successfully by admin (TC004)', async () => {
      // Setup data
      const adminUser = {
        id: 'admin-offline',
        username: 'admin-offline',
        email: 'admin-offline@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const versionData = {
        id: 'version-offline',
        name: 'v1.0-offline',
        description: 'Offline test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-offline-test',
        label: 'Published Style',
        slug: 'published-style-offline',
        description: 'Style to be offlined',
        type: 'animation',
        thumbKey: 'published-offline-thumb.jpg',
        priority: 1,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-offline'
      }
      await controller.create('Style', styleData)

      // Offline style
      const payload = {
        styleId: 'style-offline-test'
      }

      const result = await controller.call('OfflineStyleInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()

      // Verify style is offlined
      const offlinedStyle = await controller.findOne('Style', {
        id: 'style-offline-test'
      })
      expect(offlinedStyle.data.status).toBe('offline')

      // Verify version counts updated
      const version = await controller.findOne('Version', {
        id: 'version-offline'
      })
      expect(version.data.publishedStylesCount).toBe(0)
      expect(version.data.offlineStylesCount).toBe(1)
    })

    it('should reject offline by editor', async () => {
      // Setup data
      const editorUser = {
        id: 'editor-offline',
        username: 'editor-offline',
        email: 'editor-offline@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const versionData = {
        id: 'version-editor-offline',
        name: 'v1.0-editor-offline',
        description: 'Editor offline test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const styleData = {
        id: 'style-editor-offline',
        label: 'Editor Published Style',
        slug: 'editor-published',
        description: 'Editor published style',
        type: 'animation',
        thumbKey: 'editor-published-thumb.jpg',
        priority: 1,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-editor-offline'
      }
      await controller.create('Style', styleData)

      const payload = {
        styleId: 'style-editor-offline'
      }

      const result = await controller.call('OfflineStyleInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('Query Interactions', () => {
    it('should get styles by status (TC010)', async () => {
      // Setup data
      const viewerUser = {
        id: 'viewer-query',
        username: 'viewer-query',
        email: 'viewer-query@example.com',
        role: 'viewer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', viewerUser)

      const versionData = {
        id: 'version-query',
        name: 'v1.0-query',
        description: 'Query test version',
        status: 'published',
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString()
      }
      await controller.create('Version', versionData)

      // Create styles with different statuses
      const statuses = ['draft', 'published', 'published', 'offline']
      for (let i = 0; i < statuses.length; i++) {
        const styleData = {
          id: `style-query-${i + 1}`,
          label: `Query Style ${i + 1}`,
          slug: `query-style-${i + 1}`,
          description: `Style with ${statuses[i]} status`,
          type: 'animation',
          thumbKey: `query-${i + 1}-thumb.jpg`,
          priority: i + 1,
          status: statuses[i],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-query'
        }

        await controller.create('Style', styleData)
      }

      // Query published styles
      const payload = {
        versionId: 'version-query',
        status: 'published'
      }

      const result = await controller.call('GetStylesByStatusInteraction', payload, {
        user: viewerUser
      })

      expect(result.error).toBeUndefined()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(style => style.status === 'published')).toBe(true)
    })

    it('should get styles by type (TC011)', async () => {
      // Setup data
      const editorUser = {
        id: 'editor-type-query',
        username: 'editor-type-query',
        email: 'editor-type-query@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const versionData = {
        id: 'version-type-query',
        name: 'v1.0-type-query',
        description: 'Type query test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create styles with different types
      const types = ['animation', 'surreal', 'animation', 'realistic']
      for (let i = 0; i < types.length; i++) {
        const styleData = {
          id: `style-type-${i + 1}`,
          label: `Type Style ${i + 1}`,
          slug: `type-style-${i + 1}`,
          description: `Style with ${types[i]} type`,
          type: types[i],
          thumbKey: `type-${i + 1}-thumb.jpg`,
          priority: i + 1,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-type-query'
        }

        await controller.create('Style', styleData)
      }

      // Query animation styles
      const payload = {
        versionId: 'version-type-query',
        type: 'animation'
      }

      const result = await controller.call('GetStylesByTypeInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeUndefined()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(style => style.type === 'animation')).toBe(true)
    })

    it('should search styles (TC012)', async () => {
      // Setup data
      const adminUser = {
        id: 'admin-search',
        username: 'admin-search',
        email: 'admin-search@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const versionData = {
        id: 'version-search',
        name: 'v1.0-search',
        description: 'Search test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create styles with different labels
      const styles = [
        { label: 'Manga Style', slug: 'manga' },
        { label: 'Anime Style', slug: 'anime' },
        { label: 'Realistic Portrait', slug: 'realistic' },
        { label: 'Manga Character', slug: 'manga-char' }
      ]

      for (let i = 0; i < styles.length; i++) {
        const styleData = {
          id: `style-search-${i + 1}`,
          label: styles[i].label,
          slug: styles[i].slug,
          description: `Description for ${styles[i].label}`,
          type: 'animation',
          thumbKey: `search-${i + 1}-thumb.jpg`,
          priority: i + 1,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-search'
        }

        await controller.create('Style', styleData)
      }

      // Search for 'manga'
      const payload = {
        versionId: 'version-search',
        keyword: 'manga'
      }

      const result = await controller.call('SearchStylesInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(style => 
        style.label.toLowerCase().includes('manga') || 
        style.description.toLowerCase().includes('manga')
      )).toBe(true)
    })
  })

  describe('Version Management Interactions', () => {
    it('should create version by admin (TC007)', async () => {
      const adminUser = {
        id: 'admin-create-version',
        username: 'admin-create-version',
        email: 'admin-create-version@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', adminUser)

      const payload = {
        name: 'v1.1',
        description: '新增动画风格支持',
        baseVersionId: ''
      }

      const result = await controller.call('CreateVersionInteraction', payload, {
        user: adminUser
      })

      expect(result.error).toBeUndefined()
      
      // Verify version was created
      const createdVersion = await controller.findOne('Version', {
        name: 'v1.1'
      })
      expect(createdVersion.error).toBeUndefined()
      expect(createdVersion.data.status).toBe('draft')
    })

    it('should reject version creation by editor', async () => {
      const editorUser = {
        id: 'editor-create-version',
        username: 'editor-create-version',
        email: 'editor-create-version@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const payload = {
        name: 'v1.1-editor',
        description: 'Editor version attempt',
        baseVersionId: ''
      }

      const result = await controller.call('CreateVersionInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeDefined()
    })

    it('should get version stats by editor (TC016)', async () => {
      // Setup data
      const editorUser = {
        id: 'editor-stats',
        username: 'editor-stats',
        email: 'editor-stats@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', editorUser)

      const versionData = {
        id: 'version-stats',
        name: 'v1.0-stats',
        description: 'Stats test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create styles with different statuses
      const statuses = ['draft', 'published', 'offline']
      for (let i = 0; i < statuses.length; i++) {
        const styleData = {
          id: `style-stats-${i + 1}`,
          label: `Stats Style ${i + 1}`,
          slug: `stats-style-${i + 1}`,
          description: `Style with ${statuses[i]} status`,
          type: 'animation',
          thumbKey: `stats-${i + 1}-thumb.jpg`,
          priority: i + 1,
          status: statuses[i],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-stats'
        }

        await controller.create('Style', styleData)
      }

      const payload = {
        versionId: 'version-stats'
      }

      const result = await controller.call('GetVersionStatsInteraction', payload, {
        user: editorUser
      })

      expect(result.error).toBeUndefined()
      expect(result.data.stylesCount).toBe(3)
      expect(result.data.draftStylesCount).toBe(1)
      expect(result.data.publishedStylesCount).toBe(1)
      expect(result.data.offlineStylesCount).toBe(1)
    })

    it('should reject version stats query by viewer', async () => {
      const viewerUser = {
        id: 'viewer-stats',
        username: 'viewer-stats',
        email: 'viewer-stats@example.com',
        role: 'viewer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', viewerUser)

      const versionData = {
        id: 'version-viewer-stats',
        name: 'v1.0-viewer-stats',
        description: 'Viewer stats test version',
        status: 'published',
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString()
      }
      await controller.create('Version', versionData)

      const payload = {
        versionId: 'version-viewer-stats'
      }

      const result = await controller.call('GetVersionStatsInteraction', payload, {
        user: viewerUser
      })

      expect(result.error).toBeDefined()
    })
  })
})