/**
 * COUNT CALLBACK - regression tests
 *
 * These scenarios were originally reported as framework bugs (count not
 * responding to computed-property changes; double counting with StateMachine
 * properties). The bugs have since been FIXED — every test below asserts the
 * CORRECT values and passes. The scenarios are kept as regressions:
 *
 * 1. Count callback filtering by a COMPUTED property (isActive derived from
 *    a StateMachine-controlled _status) must re-evaluate when the underlying
 *    property changes.
 * 2. Count callback filtering by a StateMachine property directly must count
 *    each record exactly once.
 * 3. Count must decrease when a child stops matching the callback.
 *
 * Related file: count-hard-deletion.spec.ts (HardDeletionProperty on Relation).
 *
 * Real-world pattern covered: Content.commentCount with soft deletion
 * (Comment._softDeletion StateMachine + Comment.isDeleted computed).
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
  StateNode,
  StateTransfer,
  Count,
  MatchExp,
  InteractionEventEntity,
  Controller,
  MonoSystem
} from 'interaqt'
import { PGLiteDB } from '@drivers';

// =============================================================================
// SHARED DATA MODEL
// =============================================================================

// Parent entity with count property
const Parent = Entity.create({
  name: 'BugTestParent',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'activeChildCount', type: 'number' })
  ]
})

// States for Child._status
const activeState = StateNode.create({
  name: 'active',
  computeValue: () => 'active'
})

const inactiveState = StateNode.create({
  name: 'inactive',
  computeValue: () => 'inactive'
})

// Child entity with _status (StateMachine) and isActive (computed)
const Child = Entity.create({
  name: 'BugTestChild',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: '_status', type: 'string' }),  // StateMachine-controlled
    Property.create({ name: 'isActive', type: 'boolean' }) // Computed from _status
  ]
})

// Relation: Child belongs to Parent
const ChildParentRelation = Relation.create({
  source: Child,
  sourceProperty: 'parent',
  target: Parent,
  targetProperty: 'children',
  type: 'n:1',
  properties: []
})

// =============================================================================
// INTERACTIONS
// =============================================================================

const CreateParent = Interaction.create({
  name: 'CreateBugTestParent',
  action: Action.create({ name: 'createBugTestParent' }),
  payload: Payload.create({
    items: [PayloadItem.create({ name: 'name', type: 'string' })]
  })
})

const CreateChild = Interaction.create({
  name: 'CreateBugTestChild',
  action: Action.create({ name: 'createBugTestChild' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'parentId', type: 'string' }),
      PayloadItem.create({ name: 'name', type: 'string' })
    ]
  })
})

const DeactivateChild = Interaction.create({
  name: 'DeactivateBugTestChild',
  action: Action.create({ name: 'deactivateBugTestChild' }),
  payload: Payload.create({
    items: [PayloadItem.create({ name: 'childId', type: 'string' })]
  })
})

// =============================================================================
// COMPUTATIONS (shared)
// =============================================================================

// Parent creation
Parent.computation = Transform.create({
  eventDeps: {
    interactionEvent: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateParent.name }
    }
  },
  callback: async function(mutationEvent: { record: { payload: { name: string } } }) {
    return { name: mutationEvent.record.payload.name }
  }
})

// Child creation
Child.computation = Transform.create({
  eventDeps: {
    interactionEvent: {
      recordName: InteractionEventEntity.name,
      type: 'create',
      record: { interactionName: CreateChild.name }
    }
  },
  callback: async function(mutationEvent: { record: { payload: { name: string; parentId: string } } }) {
    const event = mutationEvent.record
    return {
      name: event.payload.name,
      parent: { id: event.payload.parentId }
    }
  }
})

// Child._status StateMachine
const statusProperty = Child.properties.find(p => p.name === '_status')!
statusProperty.computation = StateMachine.create({
  states: [activeState, inactiveState],
  initialState: activeState,
  transfers: [
    StateTransfer.create({
      trigger: {
        recordName: InteractionEventEntity.name,
        type: 'create',
        record: { interactionName: DeactivateChild.name }
      },
      current: activeState,
      next: inactiveState,
      computeTarget: (mutationEvent: { record: { payload: { childId: string } } }) => ({
        id: mutationEvent.record!.payload.childId
      })
    })
  ]
})

// Child.isActive computed property
const isActiveProperty = Child.properties.find(p => p.name === 'isActive')!
isActiveProperty.computed = (child: { _status?: string }) => child._status === 'active'

// =============================================================================
// TEST SUITE
// =============================================================================

const entities = [Parent, Child]
const relations = [ChildParentRelation]
const interactions = [CreateParent, CreateChild, DeactivateChild]

describe('Count Callback Bug Verification', () => {
  
  // ---------------------------------------------------------------------------
  // Scenario 1: computed property changes trigger Count recount (fixed regression)
  // ---------------------------------------------------------------------------
  describe('Count recount on computed property change', () => {
    let controller: Controller

    beforeEach(async () => {
      // Reset the activeChildCount computation to use computed property (isActive)
      const activeChildCountProperty = Parent.properties.find(p => p.name === 'activeChildCount')!
      activeChildCountProperty.computation = Count.create({
        property: 'children',
        attributeQuery: ['id', 'isActive'],  // Using COMPUTED property
        callback: function(child: { isActive?: boolean }) {
          return child.isActive === true
        }
      })

      const system = new MonoSystem(new PGLiteDB())
      controller = new Controller({
        system,
        entities,
        relations,
        eventSources: interactions,
        ignoreGuard: true,
        forceThrowDispatchError: true
      })
      await controller.setup(true)
    })

    it('Count decreases when the computed property stops matching', async () => {
      // Create parent
      await controller.dispatch(CreateParent, {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Create active child
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })

      let updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )
      expect(updatedParent.activeChildCount).toBe(1)

      // Get child and verify it's active
      const children = await controller.system.storage.find(Child.name, undefined, undefined, ['id', '_status', 'isActive'])
      const child = children[0]
      expect(child._status).toBe('active')
      expect(child.isActive).toBe(true)

      // Deactivate child
      await controller.dispatch(DeactivateChild, {
        user: { id: 'test-user' },
        payload: { childId: child.id }
      })

      // Verify child is now inactive
      const deactivatedChild = await controller.system.storage.findOne(
        Child.name,
        MatchExp.atom({ key: 'id', value: ['=', child.id] }),
        undefined,
        ['id', '_status', 'isActive']
      )
      expect(deactivatedChild._status).toBe('inactive')
      expect(deactivatedChild.isActive).toBe(false)

      // count must drop to 0 once the child stops matching
      updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      expect(updatedParent.activeChildCount).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Scenario 2: StateMachine property counts each record exactly once (fixed regression)
  // ---------------------------------------------------------------------------
  describe('Count with StateMachine property counts once per record', () => {
    let controller: Controller

    beforeEach(async () => {
      // Reset the activeChildCount computation to use StateMachine property (_status)
      const activeChildCountProperty = Parent.properties.find(p => p.name === 'activeChildCount')!
      activeChildCountProperty.computation = Count.create({
        property: 'children',
        attributeQuery: ['id', '_status'],  // Using STATEMACHINE property
        callback: function(child: { _status?: string }) {
          return child._status === 'active'
        }
      })

      const system = new MonoSystem(new PGLiteDB())
      controller = new Controller({
        system,
        entities,
        relations,
        eventSources: interactions,
        ignoreGuard: true,
        forceThrowDispatchError: true
      })
      await controller.setup(true)
    })

    it('one child with a StateMachine property is counted once', async () => {
      // Create parent
      await controller.dispatch(CreateParent, {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Create ONE active child
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })

      let updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      expect(updatedParent.activeChildCount).toBe(1)
    })

    it('multiple children are each counted once', async () => {
      // Create parent
      await controller.dispatch(CreateParent, {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id'])
      const parent = parents[0]

      // Create THREE children
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 2' }
      })
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 3' }
      })

      const updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      expect(updatedParent.activeChildCount).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  // Scenario 3: status change decreases the count (fixed regression)
  // ---------------------------------------------------------------------------
  describe('Count decreases when a child stops matching the callback', () => {
    let controller: Controller

    beforeEach(async () => {
      // Reset the activeChildCount computation to use StateMachine property (_status)
      const activeChildCountProperty = Parent.properties.find(p => p.name === 'activeChildCount')!
      activeChildCountProperty.computation = Count.create({
        property: 'children',
        attributeQuery: ['id', '_status'],  // Using STATEMACHINE property
        callback: function(child: { _status?: string }) {
          return child._status === 'active'
        }
      })

      const system = new MonoSystem(new PGLiteDB())
      controller = new Controller({
        system,
        entities,
        relations,
        eventSources: interactions,
        ignoreGuard: true,
        forceThrowDispatchError: true
      })
      await controller.setup(true)
    })

    it('Count decreases after deactivation', async () => {
      // This test verifies the interaction between HardDeletionProperty and Count callback.
      // When a relation or entity with HardDeletionProperty is physically deleted,
      // the Count computation should properly decrease.
      
      // Create parent
      await controller.dispatch(CreateParent, {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Create active child
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })

      // This test focuses on whether deactivation properly decreases the count
      let updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )
      const countAfterCreate = updatedParent.activeChildCount
      console.log(`Count after create: ${countAfterCreate}`)

      // Get child
      const children = await controller.system.storage.find(Child.name, undefined, undefined, ['id', '_status'])
      const child = children[0]
      expect(child._status).toBe('active')

      // Now deactivate the child (which changes _status to 'inactive')
      await controller.dispatch(DeactivateChild, {
        user: { id: 'test-user' },
        payload: { childId: child.id }
      })

      // After deactivation, count should decrease (child no longer matches callback)
      updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )
      
      console.log(`Count after deactivate: ${updatedParent.activeChildCount}`)
      
      // Due to the bug, the count may not properly decrease
      // Expected: 0 (child is now inactive, should not be counted)
      // Actual behavior may vary depending on the specific bug manifestation
      expect(updatedParent.activeChildCount).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Control test: Count works correctly without callback filter
  // ---------------------------------------------------------------------------
  describe('Control: Count without callback works correctly', () => {
    let controller: Controller

    beforeEach(async () => {
      // Reset the activeChildCount computation to simple count (no callback)
      const activeChildCountProperty = Parent.properties.find(p => p.name === 'activeChildCount')!
      activeChildCountProperty.computation = Count.create({
        property: 'children'
        // No callback - just count all children
      })

      const system = new MonoSystem(new PGLiteDB())
      controller = new Controller({
        system,
        entities,
        relations,
        eventSources: interactions,
        ignoreGuard: true,
        forceThrowDispatchError: true
      })
      await controller.setup(true)
    })

    it('Simple Count without callback works correctly', async () => {
      // Create parent
      await controller.dispatch(CreateParent, {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Add children
      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })

      let updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )
      expect(updatedParent.activeChildCount).toBe(1)  // Works correctly

      await controller.dispatch(CreateChild, {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 2' }
      })

      updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )
      expect(updatedParent.activeChildCount).toBe(2)  // Works correctly
    })
  })
})
