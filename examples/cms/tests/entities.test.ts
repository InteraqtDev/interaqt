import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, BoolExp } from '@'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Entities Tests', () => {
  let controller: Controller
  let system: MonoSystem

  beforeEach(async () => {
    // Create in-memory system
    system = new MonoSystem()
    system.conceptClass = KlassByName
    
    controller = new Controller(system, entities, relations, activities, interactions, dicts, [])
    await controller.setup(true)
  })

  afterEach(async () => {
    // No explicit cleanup needed for in-memory system
  })

  describe('User Entity', () => {
    it('should create a user successfully', async () => {
      const userData = {
        id: 'user-001',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const result = await system.storage.create('User', userData)
      expect(result).toBeDefined()
      expect(result.id).toBe('user-001')
      expect(result.username).toBe('testuser')
    })

    it('should create users with different roles', async () => {
      const roles = ['admin', 'editor', 'viewer']
      
      for (let i = 0; i < roles.length; i++) {
        const userData = {
          id: `user-${i + 1}`,
          username: `user${i + 1}`,
          email: `user${i + 1}@example.com`,
          role: roles[i],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const result = await system.storage.create('User', userData)
        expect(result).toBeDefined()
        expect(result.role).toBe(roles[i])
      }
    })
  })

  describe('Version Entity', () => {
    it('should create a version successfully', async () => {
      const versionData = {
        id: 'version-001',
        name: 'v1.0',
        description: 'Initial version',
        status: 'draft',
        createdAt: new Date().toISOString(),
        publishedAt: null
      }

      const result = await system.storage.create('Version', versionData)
      expect(result).toBeDefined()
      expect(result.name).toBe('v1.0')
      expect(result.status).toBe('draft')
    })

    it('should create versions with different statuses', async () => {
      const statuses = ['draft', 'published']
      
      for (let i = 0; i < statuses.length; i++) {
        const versionData = {
          id: `version-${i + 1}`,
          name: `v1.${i}`,
          description: `Version ${i + 1}`,
          status: statuses[i],
          createdAt: new Date().toISOString(),
          publishedAt: statuses[i] === 'published' ? new Date().toISOString() : null
        }

        const result = await system.storage.create('Version', versionData)
        expect(result).toBeDefined()
        expect(result.status).toBe(statuses[i])
      }
    })
  })

  describe('Style Entity', () => {
    it('should create a style successfully', async () => {
      const styleData = {
        id: 'style-001',
        label: 'Manga Style',
        slug: 'manga',
        description: 'Japanese manga style',
        type: 'animation',
        thumbKey: 'styles/manga-thumb.jpg',
        priority: 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      const result = await system.storage.create('Style', styleData)
      expect(result).toBeDefined()
      expect(result.label).toBe('Manga Style')
      expect(result.slug).toBe('manga')
    })

    it('should create styles with different types', async () => {
      const types = ['animation', 'surreal', 'realistic', 'abstract']
      
      for (let i = 0; i < types.length; i++) {
        const styleData = {
          id: `style-${i + 1}`,
          label: `${types[i]} Style`,
          slug: types[i].toLowerCase(),
          description: `${types[i]} style description`,
          type: types[i],
          thumbKey: `styles/${types[i]}-thumb.jpg`,
          priority: i + 1,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const result = await system.storage.create('Style', styleData)
        expect(result).toBeDefined()
        expect(result.type).toBe(types[i])
      }
    })

    it('should create styles with different statuses', async () => {
      const statuses = ['draft', 'published', 'offline']
      
      for (let i = 0; i < statuses.length; i++) {
        const styleData = {
          id: `style-status-${i + 1}`,
          label: `${statuses[i]} Style`,
          slug: `${statuses[i]}-style`,
          description: `Style with ${statuses[i]} status`,
          type: 'animation',
          thumbKey: `styles/${statuses[i]}-thumb.jpg`,
          priority: i + 1,
          status: statuses[i],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        const result = await system.storage.create('Style', styleData)
        expect(result).toBeDefined()
        expect(result.status).toBe(statuses[i])
      }
    })
  })

  describe('Entity Updates', () => {
    it('should update user information', async () => {
      const userData = {
        id: 'user-update-test',
        username: 'originaluser',
        email: 'original@example.com',
        role: 'editor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await system.storage.create('User', userData)

      const updateData = {
        username: 'updateduser',
        email: 'updated@example.com',
        updatedAt: new Date().toISOString()
      }

      const idMatch = BoolExp.atom({key: 'id', value: ['=', 'user-update-test']})
      const result = await system.storage.update('User', idMatch, updateData)
      expect(result).toBeDefined()

      // Verify update
      const updated = await system.storage.findOne('User', idMatch)
      expect(updated.username).toBe('updateduser')
      expect(updated.email).toBe('updated@example.com')
    })

    it('should update style information', async () => {
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
        updatedAt: new Date().toISOString()
      }

      await system.storage.create('Style', styleData)

      const updateData = {
        label: 'Updated Style',
        description: 'Updated description',
        updatedAt: new Date().toISOString()
      }

      const idMatch = BoolExp.atom({key: 'id', value: ['=', 'style-update-test']})
      const result = await system.storage.update('Style', idMatch, updateData)
      expect(result).toBeDefined()

      // Verify update
      const updated = await system.storage.findOne('Style', idMatch)
      expect(updated.label).toBe('Updated Style')
      expect(updated.description).toBe('Updated description')
    })
  })
})