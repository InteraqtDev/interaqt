/**
 * COUNT WITH HARDDELETIONPROPERTY ON RELATION - Bug Verification Test
 * 
 * =============================================================================
 * BUG: HardDeletionProperty on Relation causes RecordBoundState error
 * =============================================================================
 * 
 * DESCRIPTION:
 * When a Relation has HardDeletionProperty and is deleted via StateMachine
 * transition, AND there's a Count computation with callback that depends on
 * this relation, the framework throws a TypeError.
 * 
 * EXAMPLE:
 * - ChildParentRelation has HardDeletionProperty
 * - Parent.childCount = Count({ property: 'children', callback: c => c.isActive })
 * - DeleteRelation interaction triggers HardDeletionProperty state change
 * 
 * EXPECTED: Count decreases properly when relation is deleted
 * ACTUAL: Framework throws TypeError: Cannot read properties of undefined 
 *         (reading '_ParentEntity_childCount_bound_isItemMatchCount')
 * 
 * ROOT CAUSE (Count.ts:233):
 *   if((await (this.state as StateWithCallback).isItemMatchCount!.get(relatedMutationEvent.oldRecord)))
 * 
 * The RecordBoundState table is not properly initialized or accessed when
 * processing a delete event triggered by HardDeletionProperty.
 * 
 * =============================================================================
 * IMPACT ON REAL-WORLD SCENARIOS
 * =============================================================================
 * 
 * This bug affects patterns like Topic.usageCount with relation hard deletion:
 * - ContentTopicRelation has HardDeletionProperty
 * - Topic.usageCount = Count({ property: 'contents', callback: c => !c._softDeletion })
 * 
 * When relation is hard deleted -> RecordBoundState error
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Transform,
  StateMachine,
  StateTransfer,
  Count,
  MatchExp,
  InteractionEventEntity,
  Controller,
  MonoSystem,
  HardDeletionProperty,
  DELETED_STATE,
  NON_DELETED_STATE,
  HARD_DELETION_PROPERTY_NAME
} from 'interaqt'
import { PGLiteDB } from '@dbclients';

// =============================================================================
// DATA MODEL
// =============================================================================

// Parent entity with count property
const TestParent = Entity.create({
  name: 'HardDeleteTestParent',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'activeChildCount', type: 'number' })
  ]
})

// Child entity
const TestChild = Entity.create({
  name: 'HardDeleteTestChild',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'isActive', type: 'boolean' })
  ]
})

// Relation with HardDeletionProperty
const TestRelation = Relation.create({
  source: TestChild,
  sourceProperty: 'parent',
  target: TestParent,
  targetProperty: 'children',
  type: 'n:1',
  properties: [
    HardDeletionProperty.create()
  ]
})

// =============================================================================
// INTERACTIONS
// =============================================================================

const CreateTestParent = Interaction.create({
  name: 'CreateHardDeleteTestParent',
  action: Action.create({ name: 'createHardDeleteTestParent' }),
  payload: Payload.create({
    items: [PayloadItem.create({ name: 'name', type: 'string' })]
  })
})

const CreateTestChild = Interaction.create({
  name: 'CreateHardDeleteTestChild',
  action: Action.create({ name: 'createHardDeleteTestChild' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'parentId', type: 'string' }),
      PayloadItem.create({ name: 'name', type: 'string' })
    ]
  })
})

const DeleteRelation = Interaction.create({
  name: 'DeleteHardDeleteTestRelation',
  action: Action.create({ name: 'deleteHardDeleteTestRelation' }),
  payload: Payload.create({
    items: [PayloadItem.create({ name: 'childId', type: 'string' })]
  })
})

// =============================================================================
// COMPUTATIONS
// =============================================================================

// Parent creation
TestParent.computation = Transform.create({
  eventDeps: {
    interactionEvent: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateTestParent.name }
    }
  },
  callback: async function(mutationEvent: { record: { payload: { name: string } } }) {
    return { name: mutationEvent.record.payload.name }
  }
})

// Child creation
TestChild.computation = Transform.create({
  eventDeps: {
    interactionEvent: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateTestChild.name }
    }
  },
  callback: async function(mutationEvent: { record: { payload: { name: string; parentId: string } } }) {
    const event = mutationEvent.record
    return {
      name: event.payload.name,
      isActive: true,
      parent: { id: event.payload.parentId }
    }
  }
})

// Count with callback on Parent
const activeChildCountProp = TestParent.properties.find(p => p.name === 'activeChildCount')!
activeChildCountProp.computation = Count.create({
  property: 'children',
  attributeQuery: ['id', 'isActive'],
  callback: function(child: { isActive?: boolean }) {
    return child.isActive === true
  }
})

// HardDeletionProperty StateMachine on relation
const hardDeletionProp = TestRelation.properties!.find(p => p.name === HARD_DELETION_PROPERTY_NAME)!
hardDeletionProp.computation = StateMachine.create({
  states: [NON_DELETED_STATE, DELETED_STATE],
  initialState: NON_DELETED_STATE,
  transfers: [
    StateTransfer.create({
      trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: { interactionName: DeleteRelation.name }
      },
      current: NON_DELETED_STATE,
      next: DELETED_STATE,
      computeTarget: async function(this: Controller, mutationEvent: any) {
        const MatchExp = this.globals.MatchExp
        const relation = await this.system.storage.findOne(
          TestRelation.name,
          MatchExp.atom({
            key: 'source.id',
            value: ['=', mutationEvent.record.payload.childId]
          }),
          undefined,
          ['id']
        )
        return relation ? { id: relation.id } : undefined
      }
    })
  ]
})

// =============================================================================
// TEST SUITE
// =============================================================================

const testEntities = [TestParent, TestChild]
const testRelations = [TestRelation]
const testInteractions = [CreateTestParent, CreateTestChild, DeleteRelation]

describe('Count with HardDeletionProperty on Relation', () => {
  let controller: Controller

  beforeEach(async () => {
    const system = new MonoSystem(new PGLiteDB())
    controller = new Controller({
      system,
      entities: testEntities,
      relations: testRelations,
      interactions: testInteractions,
      activities: [],
      ignorePermission: true,
      forceThrowInteractionError: true
    })
    await controller.setup(true)
  })

  it('Count should decrease when relation is hard deleted via HardDeletionProperty', async () => {
    /**
     * BUG: When a Relation with HardDeletionProperty is deleted via StateMachine transition,
     * and there's a Count computation with callback that depends on this relation,
     * the framework throws:
     * 
     *   TypeError: Cannot read properties of undefined 
     *     (reading '_HardDeleteTestParent_activeChildCount_bound_isItemMatchCount')
     * 
     * Root cause: In PropertyCountHandle.incrementalCompute (Count.ts:233):
     *   if((await (this.state as StateWithCallback).isItemMatchCount!.get(relatedMutationEvent.oldRecord)))
     * 
     * The RecordBoundState table is not properly initialized or accessed when
     * processing a delete event triggered by HardDeletionProperty.
     */

    // Create parent
    await controller.callInteraction('CreateHardDeleteTestParent', {
      user: { id: 'test-user' },
      payload: { name: 'Test Parent' }
    })

    const parents = await controller.system.storage.find(TestParent.name, undefined, undefined, ['id', 'activeChildCount'])
    const parent = parents[0]
    expect(parent.activeChildCount).toBe(0)

    // Create child (this creates both child and relation)
    await controller.callInteraction('CreateHardDeleteTestChild', {
      user: { id: 'test-user' },
      payload: { parentId: parent.id, name: 'Child 1' }
    })

    let updatedParent = await controller.system.storage.findOne(
      TestParent.name,
      MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
      undefined,
      ['id', 'activeChildCount']
    )
    console.log(`Count after create: ${updatedParent.activeChildCount}`)
    expect(updatedParent.activeChildCount).toBe(1)

    // Get the child
    const children = await controller.system.storage.find(TestChild.name, undefined, undefined, ['id'])
    expect(children.length).toBe(1)
    const child = children[0]

    // Delete the relation via HardDeletionProperty
    // Expected: Count should decrease to 0
    // Actual: Framework throws TypeError about RecordBoundState
    await controller.callInteraction('DeleteHardDeleteTestRelation', {
      user: { id: 'test-user' },
      payload: { childId: child.id }
    })

    // Verify relation is deleted
    const relations = await controller.system.storage.find(TestRelation.name, undefined, undefined, ['id'])
    expect(relations.length).toBe(0)

    // Check count after deletion - should be 0
    updatedParent = await controller.system.storage.findOne(
      TestParent.name,
      MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
      undefined,
      ['id', 'activeChildCount']
    )
    console.log(`Count after delete: ${updatedParent.activeChildCount}`)
    expect(updatedParent.activeChildCount).toBe(0)
  })
})
