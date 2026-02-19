import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage'
import { Entity, Property } from '@core'
import { PGLiteDB } from '@drivers'
import { RecordMutationEvent } from '@runtime'

describe('Computed field update events', () => {
  let db: PGLiteDB
  let setup: DBSetup
  let handle: EntityQueryHandle

  beforeEach(async () => {
    db = new PGLiteDB()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  test('update events include computed field changes', async () => {
    const Task = Entity.create({
      name: 'Task',
      properties: [
        Property.create({ name: 'status', type: 'string' }),
        Property.create({
          name: 'isActive',
          type: 'boolean',
          computed: (record: any) => record.status === 'active'
        })
      ]
    })

    setup = new DBSetup([Task], [], db)
    await setup.createTables()
    handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

    const taskId = await handle.create('Task', { status: 'active' })

    const events: RecordMutationEvent[] = []
    await handle.update(
      'Task',
      MatchExp.atom({ key: 'id', value: ['=', taskId.id] }),
      { status: 'inactive' },
      events
    )

    const updateEvent = events.find(
      event => event.type === 'update' && event.recordName === 'Task'
    )

    expect(updateEvent?.record).toMatchObject({
      status: 'inactive',
      isActive: false
    })
    expect(updateEvent?.oldRecord).toMatchObject({
      status: 'active',
      isActive: true
    })

    const updatedTask = await handle.findOne(
      'Task',
      MatchExp.atom({ key: 'id', value: ['=', taskId.id] }),
      undefined,
      ['id', 'status', 'isActive']
    )

    expect(updatedTask.status).toBe('inactive')
    expect(updatedTask.isActive).toBe(false)
  })
})
