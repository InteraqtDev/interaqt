import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Controller, Database } from 'interaqt'
import { PGlite } from '@electric-sql/pglite'
import { entities, relations, computations, interactions } from '../backend'

describe('Relations Tests', () => {
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

  describe('StyleVersionRelation (Style belongs to Version)', () => {
    it('should establish style-version relationship', async () => {
      // Create version first
      const versionData = {
        id: 'version-001',
        name: 'v1.0',
        description: 'Test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create style with version reference
      const styleData = {
        id: 'style-001',
        label: 'Test Style',
        slug: 'test-style',
        description: 'Test style description',
        type: 'animation',
        thumbKey: 'test-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-001'
      }

      const result = await controller.create('Style', styleData)
      expect(result.error).toBeUndefined()
      expect(result.data.version).toBe('version-001')
    })

    it('should fail when referencing non-existent version', async () => {
      const styleData = {
        id: 'style-orphan',
        label: 'Orphan Style',
        slug: 'orphan',
        description: 'Style without valid version',
        type: 'animation',
        thumbKey: 'orphan-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'non-existent-version'
      }

      const result = await controller.create('Style', styleData)
      expect(result.error).toBeDefined()
    })

    it('should allow multiple styles to belong to same version', async () => {
      // Create version
      const versionData = {
        id: 'version-shared',
        name: 'v1.0-shared',
        description: 'Shared version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create multiple styles
      const styles = [
        {
          id: 'style-001',
          label: 'Style 1',
          slug: 'style-1',
          priority: 1
        },
        {
          id: 'style-002',
          label: 'Style 2',
          slug: 'style-2',
          priority: 2
        },
        {
          id: 'style-003',
          label: 'Style 3',
          slug: 'style-3',
          priority: 3
        }
      ]

      for (const styleBase of styles) {
        const styleData = {
          ...styleBase,
          description: `${styleBase.label} description`,
          type: 'animation',
          thumbKey: `${styleBase.slug}-thumb.jpg`,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-shared'
        }

        const result = await controller.create('Style', styleData)
        expect(result.error).toBeUndefined()
        expect(result.data.version).toBe('version-shared')
      }
    })
  })

  describe('VersionStylesRelation (Version has many Styles)', () => {
    it('should retrieve all styles belonging to a version', async () => {
      // Create version
      const versionData = {
        id: 'version-with-styles',
        name: 'v1.0-with-styles',
        description: 'Version with multiple styles',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create styles
      const styleCount = 5
      for (let i = 1; i <= styleCount; i++) {
        const styleData = {
          id: `style-${i}`,
          label: `Style ${i}`,
          slug: `style-${i}`,
          description: `Style ${i} description`,
          type: 'animation',
          thumbKey: `style-${i}-thumb.jpg`,
          priority: i,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-with-styles'
        }

        await controller.create('Style', styleData)
      }

      // Query version with its styles
      const versionResult = await controller.findOne('Version', {
        id: 'version-with-styles'
      })
      expect(versionResult.error).toBeUndefined()

      // Query styles by version
      const stylesResult = await controller.findMany('Style', {
        version: 'version-with-styles'
      })
      expect(stylesResult.error).toBeUndefined()
      expect(stylesResult.data).toHaveLength(styleCount)
    })

    it('should handle version with no styles', async () => {
      const versionData = {
        id: 'version-empty',
        name: 'v1.0-empty',
        description: 'Empty version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      const stylesResult = await controller.findMany('Style', {
        version: 'version-empty'
      })
      expect(stylesResult.error).toBeUndefined()
      expect(stylesResult.data).toHaveLength(0)
    })
  })

  describe('UserStylesRelation (User creates Styles)', () => {
    it('should establish user-style creator relationship', async () => {
      // Create user
      const userData = {
        id: 'user-creator',
        username: 'creator',
        email: 'creator@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create version
      const versionData = {
        id: 'version-001',
        name: 'v1.0',
        description: 'Test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create style with creator
      const styleData = {
        id: 'style-with-creator',
        label: 'Style with Creator',
        slug: 'style-with-creator',
        description: 'Style created by user',
        type: 'animation',
        thumbKey: 'creator-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-001',
        creator: 'user-creator'
      }

      const result = await controller.create('Style', styleData)
      expect(result.error).toBeUndefined()
      expect(result.data.creator).toBe('user-creator')
    })

    it('should allow user to create multiple styles', async () => {
      // Create user
      const userData = {
        id: 'user-multi-creator',
        username: 'multicreator',
        email: 'multicreator@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create version
      const versionData = {
        id: 'version-multi',
        name: 'v1.0-multi',
        description: 'Multi-style version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create multiple styles by same user
      const styleCount = 3
      for (let i = 1; i <= styleCount; i++) {
        const styleData = {
          id: `user-style-${i}`,
          label: `User Style ${i}`,
          slug: `user-style-${i}`,
          description: `Style ${i} by user`,
          type: 'animation',
          thumbKey: `user-style-${i}-thumb.jpg`,
          priority: i,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 'version-multi',
          creator: 'user-multi-creator'
        }

        const result = await controller.create('Style', styleData)
        expect(result.error).toBeUndefined()
        expect(result.data.creator).toBe('user-multi-creator')
      }

      // Query styles by creator
      const stylesResult = await controller.findMany('Style', {
        creator: 'user-multi-creator'
      })
      expect(stylesResult.error).toBeUndefined()
      expect(stylesResult.data).toHaveLength(styleCount)
    })
  })

  describe('UserVersionsRelation (User creates Versions)', () => {
    it('should establish user-version creator relationship', async () => {
      // Create user
      const userData = {
        id: 'user-version-creator',
        username: 'versioncreator',
        email: 'versioncreator@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create version with creator
      const versionData = {
        id: 'version-with-creator',
        name: 'v1.0-with-creator',
        description: 'Version created by user',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null,
        creator: 'user-version-creator'
      }

      const result = await controller.create('Version', versionData)
      expect(result.error).toBeUndefined()
      expect(result.data.creator).toBe('user-version-creator')
    })

    it('should allow user to create multiple versions', async () => {
      // Create user
      const userData = {
        id: 'user-multi-version-creator',
        username: 'multiversioncreator',
        email: 'multiversioncreator@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create multiple versions
      const versionCount = 3
      for (let i = 1; i <= versionCount; i++) {
        const versionData = {
          id: `user-version-${i}`,
          name: `v1.${i}`,
          description: `Version ${i} by user`,
          status: 'draft',
          createdAt: new Date().toISOString(),
          publishedAt: null,
          creator: 'user-multi-version-creator'
        }

        const result = await controller.create('Version', versionData)
        expect(result.error).toBeUndefined()
        expect(result.data.creator).toBe('user-multi-version-creator')
      }

      // Query versions by creator
      const versionsResult = await controller.findMany('Version', {
        creator: 'user-multi-version-creator'
      })
      expect(versionsResult.error).toBeUndefined()
      expect(versionsResult.data).toHaveLength(versionCount)
    })
  })

  describe('Cascading Operations', () => {
    it('should handle style updates when version changes', async () => {
      // Create version
      const versionData = {
        id: 'version-cascade-test',
        name: 'v1.0-cascade',
        description: 'Cascade test version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }
      await controller.create('Version', versionData)

      // Create style
      const styleData = {
        id: 'style-cascade-test',
        label: 'Cascade Test Style',
        slug: 'cascade-test',
        description: 'Style for cascade testing',
        type: 'animation',
        thumbKey: 'cascade-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-cascade-test'
      }
      await controller.create('Style', styleData)

      // Verify relationship exists
      const styleResult = await controller.findOne('Style', {
        id: 'style-cascade-test'
      })
      expect(styleResult.error).toBeUndefined()
      expect(styleResult.data.version).toBe('version-cascade-test')
    })

    it('should handle multiple relationships correctly', async () => {
      // Create user
      const userData = {
        id: 'user-multi-rel',
        username: 'multirel',
        email: 'multirel@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await controller.create('User', userData)

      // Create version by user
      const versionData = {
        id: 'version-multi-rel',
        name: 'v1.0-multi-rel',
        description: 'Multi-relationship version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null,
        creator: 'user-multi-rel'
      }
      await controller.create('Version', versionData)

      // Create style by same user in the version
      const styleData = {
        id: 'style-multi-rel',
        label: 'Multi-Rel Style',
        slug: 'multi-rel',
        description: 'Style with multiple relationships',
        type: 'animation',
        thumbKey: 'multi-rel-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 'version-multi-rel',
        creator: 'user-multi-rel'
      }
      await controller.create('Style', styleData)

      // Verify all relationships
      const styleResult = await controller.findOne('Style', {
        id: 'style-multi-rel'
      })
      expect(styleResult.error).toBeUndefined()
      expect(styleResult.data.version).toBe('version-multi-rel')
      expect(styleResult.data.creator).toBe('user-multi-rel')

      const versionResult = await controller.findOne('Version', {
        id: 'version-multi-rel'
      })
      expect(versionResult.error).toBeUndefined()
      expect(versionResult.data.creator).toBe('user-multi-rel')
    })
  })
})