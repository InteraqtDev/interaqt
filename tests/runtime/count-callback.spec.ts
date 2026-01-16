/**
 * COUNT CALLBACK BUGS - Framework Bug Verification Tests
 * 
 * This test file demonstrates TWO related bugs in Count computation with callback.
 * 
 * =============================================================================
 * BUG 1: Count callback does not respond to computed property changes
 * =============================================================================
 * 
 * DESCRIPTION:
 * When Count.create() uses a callback that filters by a COMPUTED PROPERTY
 * (a property with .computed function), the Count does NOT re-evaluate when
 * the underlying source property changes.
 * 
 * EXAMPLE:
 * - Child._status: StateMachine property ('active' | 'inactive')
 * - Child.isActive: computed = (_status === 'active')
 * - Parent.activeChildCount = Count({ callback: c => c.isActive })
 * 
 * EXPECTED: When _status changes 'active' -> 'inactive', count decreases
 * ACTUAL: Count stays the same
 * 
 * =============================================================================
 * BUG 2: Count callback double-counts when using StateMachine property
 * =============================================================================
 * 
 * DESCRIPTION:
 * When Count.create() uses a callback that filters by a STATEMACHINE PROPERTY
 * (a property with .computation = StateMachine), each record is counted TWICE.
 * 
 * EXAMPLE:
 * - Child._status: StateMachine property ('active' | 'inactive')
 * - Parent.activeChildCount = Count({ callback: c => c._status === 'active' })
 * 
 * EXPECTED: 1 child = count 1
 * ACTUAL: 1 child = count 2
 * 
 * =============================================================================
 * IMPACT ON REAL-WORLD SCENARIOS
 * =============================================================================
 * 
 * These bugs affect common patterns like Content.commentCount:
 * - Comment._softDeletion: StateMachine property ('deleted' | null)
 * - Comment.isDeleted: computed = (_softDeletion === 'deleted')
 * - Content.commentCount = Count({ callback: c => c.status === 'approved' && !c.isDeleted })
 * 
 * Using isDeleted (computed) -> Bug 1: count doesn't decrease on delete
 * Using _softDeletion (StateMachine) -> Bug 2: each comment counted twice
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
import { PGLiteDB } from '@dbclients';

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
  // BUG 1: Computed property doesn't trigger Count recount
  // ---------------------------------------------------------------------------
  describe('BUG 1: Computed property does not trigger Count recount', () => {
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
        interactions,
        activities: [],
        ignorePermission: true,
        forceThrowInteractionError: true
      })
      await controller.setup(true)
    })

    it('Count does NOT decrease when computed property changes (BUG)', async () => {
      // Create parent
      await controller.callInteraction('CreateBugTestParent', {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Create active child
      await controller.callInteraction('CreateBugTestChild', {
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
      await controller.callInteraction('DeactivateBugTestChild', {
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

      // BUG: Count should be 0, but it's still 1
      updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      // This assertion FAILS due to BUG 1
      // Expected: 0 (child is no longer active)
      // Actual: 1 (count didn't update)
      expect(updatedParent.activeChildCount).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // BUG 2: StateMachine property causes double-counting
  // ---------------------------------------------------------------------------
  describe('BUG 2: StateMachine property causes double-counting', () => {
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
        interactions,
        activities: [],
        ignorePermission: true,
        forceThrowInteractionError: true
      })
      await controller.setup(true)
    })

    it('Each child is counted TWICE when using StateMachine property (BUG)', async () => {
      // Create parent
      await controller.callInteraction('CreateBugTestParent', {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Create ONE active child
      await controller.callInteraction('CreateBugTestChild', {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })

      // BUG: Count should be 1, but it's 2
      let updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      // This assertion FAILS due to BUG 2
      // Expected: 1 (one child)
      // Actual: 2 (child counted twice)
      expect(updatedParent.activeChildCount).toBe(1)
    })

    it('Multiple children are all double-counted (BUG)', async () => {
      // Create parent
      await controller.callInteraction('CreateBugTestParent', {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id'])
      const parent = parents[0]

      // Create THREE children
      await controller.callInteraction('CreateBugTestChild', {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 1' }
      })
      await controller.callInteraction('CreateBugTestChild', {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 2' }
      })
      await controller.callInteraction('CreateBugTestChild', {
        user: { id: 'test-user' },
        payload: { parentId: parent.id, name: 'Child 3' }
      })

      // BUG: Count should be 3, but it's 6
      const updatedParent = await controller.system.storage.findOne(
        Parent.name,
        MatchExp.atom({ key: 'id', value: ['=', parent.id] }),
        undefined,
        ['id', 'activeChildCount']
      )

      // This assertion FAILS due to BUG 2
      // Expected: 3 (three children)
      // Actual: 6 (each child counted twice)
      expect(updatedParent.activeChildCount).toBe(3)
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
        interactions,
        activities: [],
        ignorePermission: true,
        forceThrowInteractionError: true
      })
      await controller.setup(true)
    })

    it('Simple Count without callback works correctly', async () => {
      // Create parent
      await controller.callInteraction('CreateBugTestParent', {
        user: { id: 'test-user' },
        payload: { name: 'Test Parent' }
      })

      const parents = await controller.system.storage.find(Parent.name, undefined, undefined, ['id', 'activeChildCount'])
      const parent = parents[0]
      expect(parent.activeChildCount).toBe(0)

      // Add children
      await controller.callInteraction('CreateBugTestChild', {
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

      await controller.callInteraction('CreateBugTestChild', {
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
