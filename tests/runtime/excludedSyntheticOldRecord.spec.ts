import { expect, test } from 'vitest'
import {
    Action, Controller, Custom, Dictionary, Entity, Interaction, InteractionEventEntity, KlassByName,
    MatchExp, MonoSystem, Property, Relation, ScopedSequence, StateMachine, StateNode, StateTransfer,
    type RecordMutationEvent,
} from 'interaqt'
import { PGLiteDB } from '@drivers'
import { recomputeChangedComputations } from '../../src/runtime/migration.js'
import { approveGeneratedMigrationDiff, migrateWithApproval } from './helpers/migrationApproval.js'

function createSystem(db = new PGLiteDB()) {
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    return system
}

const byId = (id: unknown) => MatchExp.atom({ key: 'id', value: ['=', id] })
const active = MatchExp.atom({ key: 'status', value: ['=', 'active'] })

function sequenceModel(excludedProperty?: 'bucket' | 'serial') {
    const Host = Entity.create({
        name: 'ExcludedSequenceHost',
        properties: [
            Property.create({ name: 'status', type: 'string', excludeFromOldRecord: true }),
            Property.create({ name: 'bucket', type: 'string', excludeFromOldRecord: excludedProperty === 'bucket' }),
            Property.create({ name: 'serial', type: 'number', excludeFromOldRecord: excludedProperty === 'serial' }),
        ],
    })
    const View = Entity.create({
        name: 'ExcludedSequenceView',
        baseEntity: Host,
        matchExpression: active,
        properties: [
            Property.create({
                name: 'serial',
                type: 'number',
                computation: ScopedSequence.create({
                    name: 'ViewSequence',
                    scope: [{ name: 'bucket', type: 'string', path: 'bucket' }],
                }),
            }),
        ],
    })
    return { Host, View }
}

test.each(['bucket', 'serial'] as const)('filtered ScopedSequence rejects excluding the physical %s column', async field => {
    const { Host, View } = sequenceModel(field)
    const system = createSystem()
    const controller = new Controller({ system, entities: [Host, View], relations: [] })
    try {
        await expect(controller.setup(true)).rejects.toThrow(new RegExp(`"${Host.name}\\.${field}" declares excludeFromOldRecord, but .*${View.name}`))
    } finally {
        await system.destroy()
    }
})

test('a filtered ScopedSequence guards numbered rows in the physical record namespace', async () => {
    const { Host, View } = sequenceModel()
    const system = createSystem()
    const controller = new Controller({ system, entities: [Host, View], relations: [] })
    try {
        await controller.setup(true)
        const numbered = await system.storage.create(Host.name, { bucket: 'a', status: 'active' })
        const unrelated = await system.storage.create(Host.name, { bucket: 'a', status: 'inactive', serial: 12 })
        expect(await system.storage.findOne(Host.name, byId(numbered.id), undefined, ['serial'])).toMatchObject({ serial: 1 })
        for (const status of ['active', 'inactive']) {
            await expect(controller.runInBusinessTransaction({}, () =>
                system.storage.update(Host.name, byId(numbered.id), { bucket: 'b', status })
            )).rejects.toThrow(/scope field "bucket".*cannot change/)
        }
        await system.storage.update(Host.name, byId(unrelated.id), { bucket: 'b' })
        expect(await system.storage.findOne(Host.name, byId(numbered.id), undefined, ['bucket', 'serial'])).toMatchObject({ bucket: 'a', serial: 1 })
        expect(await system.storage.findOne(Host.name, byId(unrelated.id), undefined, ['bucket', 'serial'])).toMatchObject({ bucket: 'b', serial: 12 })
    } finally {
        await system.destroy()
    }
})

test('a filtered ScopedSequence guards an inherited reference scope only for view members', async () => {
    const Project = Entity.create({ name: 'RefSequenceProject', properties: [] })
    const Host = Entity.create({
        name: 'RefSequenceHost',
        properties: [
            Property.create({ name: 'status', type: 'string', excludeFromOldRecord: true }),
            Property.create({ name: 'serial', type: 'number' }),
        ],
    })
    const ProjectRelation = Relation.create({
        source: Host, sourceProperty: 'project', target: Project, targetProperty: 'hosts', type: 'n:1',
    })
    const View = Entity.create({
        name: 'RefSequenceView',
        baseEntity: Host,
        matchExpression: active,
        properties: [
            Property.create({
                name: 'serial',
                type: 'number',
                computation: ScopedSequence.create({
                    name: 'RefViewSequence',
                    scope: [{ name: 'project', type: 'ref', path: 'project', base: Project }],
                    allowManualValue: true,
                }),
            }),
        ],
    })
    const system = createSystem()
    const controller = new Controller({ system, entities: [Host, View, Project], relations: [ProjectRelation] })
    try {
        await controller.setup(true)
        const project = await system.storage.create(Project.name, {})
        const member = await system.storage.create(Host.name, { status: 'active', serial: 1, project: { id: project.id } })
        const nonmember = await system.storage.create(Host.name, { status: 'inactive', serial: 1, project: { id: project.id } })
        const unlink = (id: unknown) => system.storage.removeRelationByName(ProjectRelation.name!, MatchExp.atom({
            key: 'source.id', value: ['=', id],
        }))
        await expect(controller.runInBusinessTransaction({}, () => unlink(member.id))).rejects.toThrow(/scope relation "project".*cannot be removed/)
        await unlink(nonmember.id)
        expect(await system.storage.findOne(Host.name, byId(member.id), undefined, [['project', { attributeQuery: ['id'] }]])).toMatchObject({
            project: { id: project.id },
        })
        expect(await system.storage.findOne(Host.name, byId(nonmember.id), undefined, [['project', { attributeQuery: ['id'] }]])).not.toHaveProperty('project')
        await system.storage.delete(Host.name, byId(member.id))
        expect(await system.storage.findOne(Host.name, byId(member.id), undefined, ['id'])).toBeUndefined()
    } finally {
        await system.destroy()
    }
})

test.each([false, true])('global dependency fanout preserves the current host and projects oldRecord (filtered=%s)', async filtered => {
    const name = filtered ? 'FilteredFanout' : 'BaseFanout'
    const Change = Interaction.create({ name: `${name}Change`, action: Action.create({ name: 'change' }) })
    const before = StateNode.create({ name: 'before', computeValue: () => 0 })
    const after = StateNode.create({ name: 'after', computeValue: () => 1 })
    const Mode = Dictionary.create({
        name: `${name}Mode`,
        type: 'number',
        computation: StateMachine.create({
            states: [before, after],
            initialState: before,
            transfers: [StateTransfer.create({
                current: before,
                next: after,
                trigger: { type: 'create', recordName: InteractionEventEntity.name, record: { interactionName: Change.name } },
            })],
        }),
    })
    const events: RecordMutationEvent[] = []
    const computation = Custom.create({
        name: `${name}Length`,
        dataDeps: { mode: { type: 'global', source: Mode } },
        planIncremental: () => ({ type: 'incremental', dataDepKeys: [] }),
        incrementalCompute: (_last: unknown, event: RecordMutationEvent, record: { body: string }) => {
            events.push(event)
            return record.body.length
        },
    })
    const lengthProperty = (withComputation: boolean) => Property.create({
        name: 'length', type: 'number', ...(withComputation ? { computation } : {}),
    })
    const Host = Entity.create({
        name: `${name}Document`,
        properties: [
            Property.create({ name: 'status', type: 'string' }),
            Property.create({ name: 'body', type: 'string', excludeFromOldRecord: true }),
            lengthProperty(!filtered),
        ],
    })
    const entities = filtered
        ? [Host, Entity.create({ name: `${name}View`, baseEntity: Host, matchExpression: active, properties: [lengthProperty(true)] })]
        : [Host]
    const fanoutHost = entities.at(-1)!
    const system = createSystem()
    const controller = new Controller({ system, entities, relations: [], dict: [Mode], eventSources: [Change] })
    try {
        await controller.setup(true)
        const doc = await system.storage.create(Host.name, { status: 'active', body: 'text' })
        events.length = 0
        expect((await controller.dispatch(Change, { user: { id: 'u1' } })).error).toBeUndefined()
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'update', recordName: fanoutHost.name,
            record: { id: doc.id, status: 'active', body: 'text' },
            oldRecord: { id: doc.id, status: 'active' },
        })
        expect(events[0].oldRecord).not.toHaveProperty('body')
        expect(await system.storage.findOne(Host.name, byId(doc.id), undefined, ['length'])).toMatchObject({ length: 4 })
    } finally {
        await system.destroy()
    }
})

test('migration projects the old snapshot when a property takeover yields an unchanged value', async () => {
    const db = new PGLiteDB()
    const hostName = 'ExcludedMigrationHost'
    const fact = (computation?: ReturnType<typeof Custom.create>) => new Entity({
        name: hostName,
        properties: [
            new Property({ name: 'body', type: 'string', excludeFromOldRecord: true }, { uuid: 'excluded-migration-body' }),
            new Property({ name: 'length', type: 'number', computation }, { uuid: 'excluded-migration-length' }),
        ],
    }, { uuid: 'excluded-migration-host' })
    const previous = createSystem(db)
    const current = createSystem(db)
    try {
        const first = new Controller({ system: previous, entities: [fact()], relations: [] })
        await first.setup(true)
        const row = await previous.storage.create(hostName, { body: 'text', length: 4 })
        first.teardown()

        const computation = Custom.create({
            name: 'ExcludedMigrationLength',
            dataDeps: { self: { type: 'property', attributeQuery: ['body'] } },
            compute: (_deps: unknown, record: { body: string }) => record.body.length,
        })
        const next = new Controller({ system: current, entities: [fact(computation)], relations: [] })
        const approvedDiff = await approveGeneratedMigrationDiff(next)
        const { rebuildPlan } = await migrateWithApproval(next, { approvedDiff })
        const events = await recomputeChangedComputations(next, rebuildPlan, { approvedDiff })
        expect(events).toEqual([expect.objectContaining({
            type: 'update', recordName: hostName, keys: ['length'],
            record: { id: row.id, body: 'text', length: 4 },
            oldRecord: { id: row.id, length: 4 },
        })])
        expect(await current.storage.findOne(hostName, byId(row.id), undefined, ['body', 'length'])).toMatchObject({ body: 'text', length: 4 })
    } finally {
        await db.close()
    }
})
