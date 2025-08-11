/**
 * Debug测试 - 用于定位setup问题
 */

import { describe, it, expect } from 'vitest'
import { Controller, MonoSystem, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, computations } from '../backend'

describe('Debug Setup', () => {
  it('应该能成功创建Controller并setup', async () => {
    const db = new PGLiteDB()
    const system = new MonoSystem(db)
    
    console.log('Creating controller...')
    const controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      computations
    })
    
    console.log('Running setup...')
    try {
      await controller.setup()
      console.log('Setup succeeded!')
      expect(true).toBe(true)
    } catch (error) {
      console.error('Setup failed with error:', error)
      // Log more details
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
        if ('causedBy' in error) {
          console.error('Caused by:', error.causedBy)
        }
      }
      throw error
    }
  })
})
