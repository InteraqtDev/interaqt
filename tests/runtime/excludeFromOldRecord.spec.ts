/**
 * Property.excludeFromOldRecord.
 *
 * Contract: a value column declared with `excludeFromOldRecord: true` is not read by the pre-update
 * query of `storage.update` ("find record for updating ..."), and the `oldRecord` of every update
 * event of its record (storage.listen, RecordMutationSideEffect, computation event views) does not
 * contain it. Writes of the column and reads through `find` are unchanged. Setup rejects every
 * declaration whose framework consumer needs the old value (see `src/runtime/oldRecordExclusion.ts`
 * for the inventory); undeclared properties behave exactly as before.
 *
 * Cells:
 *  - SQL column set of the pre-update read, with and without the declaration;
 *  - oldRecord of update events (listener, side effect), stored value preserved, written value
 *    visible in the event record;
 *  - the same-row nested update path (`&` data of an n:1 relation updated in place through the host);
 *  - a property StateMachine driven by an interaction that writes the host (the motivating shape);
 *  - filtered-entity membership over an excluded column (allowed: membership is decided by queries,
 *    not by oldRecord) — enter and exit;
 *  - one rejected declaration per setup rule, plus legal twins that must set up.
 */
import { describe, expect, test } from 'vitest'
import {
    Action, Controller, Custom, Entity, Interaction, InteractionEventEntity, KlassByName, MatchExp, MonoSystem,
    Payload, PayloadItem, Property, RecordMutationSideEffect, Relation, ScopedSequence, StateMachine, StateNode,
    StateTransfer, Transform, Count, Dictionary,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

type RecordedQuery = { sql: string, name: string }

function recordQueries(db: PGLiteDB): { recorded: RecordedQuery[], restore: () => void } {
    const recorded: RecordedQuery[] = []
    const original = db.query.bind(db)
    ;(db as any).query = async (sql: string, params: unknown[] = [], name = '') => {
        recorded.push({ sql, name })
        return original(sql, params, name)
    }
    return { recorded, restore: () => { (db as any).query = original } }
}

function fieldOf(system: MonoSystem, recordName: string, attributeName: string): string {
    return (system.storage as any).queryHandle.map.getInfo(recordName, attributeName).field as string
}

function selectList(sql: string): string {
    return sql.slice(0, sql.search(/\bFROM\b/))
}

function preUpdateReads(recorded: RecordedQuery[], recordName: string): RecordedQuery[] {
    return recorded.filter(query => query.name === `find record for updating ${recordName}`)
}

async function createSystem(args: { entities: any[], relations?: any[], eventSources?: any[], recordMutationSideEffects?: any[], dict?: any[] }) {
    const db = new PGLiteDB()
    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: args.entities,
        relations: args.relations ?? [],
        eventSources: args.eventSources ?? [],
        dict: args.dict ?? [],
        recordMutationSideEffects: args.recordMutationSideEffects ?? [],
    } as any)
    return { db, system, controller }
}

const LARGE = 'x'.repeat(8192)

function documentEntity(name: string, exclude: boolean) {
    return Entity.create({
        name,
        properties: [
            Property.create({ name: 'title', type: 'string' }),
            Property.create({ name: 'body', type: 'string', ...(exclude ? { excludeFromOldRecord: true } : {}) }),
            Property.create({ name: 'meta', type: 'json', ...(exclude ? { excludeFromOldRecord: true } : {}) }),
        ],
    })
}

describe('excludeFromOldRecord: pre-update read and update event oldRecord', () => {
    test('declared columns are not selected by the pre-update read and are absent from oldRecord; stored values are preserved', async () => {
        const Doc = documentEntity('ExOrDoc', true)
        const { db, system, controller } = await createSystem({ entities: [Doc] })
        try {
            await controller.setup(true)
            const doc = await system.storage.create(Doc.name, { title: 'a', body: LARGE, meta: { k: 1 } })
            const listened: any[] = []
            system.storage.listen(async events => { listened.push(...events.filter(e => e.type === 'update' && e.recordName === Doc.name)) })

            const { recorded, restore } = recordQueries(db)
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { title: 'b' })
            restore()

            const [preRead] = preUpdateReads(recorded, Doc.name)
            expect(preRead).toBeDefined()
            const selected = selectList(preRead.sql)
            expect(selected).toContain(`"${fieldOf(system, Doc.name, 'title')}"`)
            expect(selected).not.toContain(`"${fieldOf(system, Doc.name, 'body')}"`)
            expect(selected).not.toContain(`"${fieldOf(system, Doc.name, 'meta')}"`)

            expect(listened).toHaveLength(1)
            expect(listened[0].oldRecord).toEqual({ id: doc.id, title: 'a' })
            expect(listened[0].keys).toEqual(['title'])
            expect(listened[0].record).toEqual({ id: doc.id, title: 'b' })

            const stored = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['*'])
            expect(stored).toMatchObject({ title: 'b', body: LARGE, meta: { k: 1 } })

            // Writing an excluded column: the event record carries the new value, oldRecord still omits it.
            listened.length = 0
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { body: 'short' })
            expect(listened).toHaveLength(1)
            expect(listened[0].record).toEqual({ id: doc.id, body: 'short' })
            expect(listened[0].oldRecord).toEqual({ id: doc.id, title: 'b' })
            const rewritten = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['body', 'meta'])
            expect(rewritten).toMatchObject({ body: 'short', meta: { k: 1 } })
        } finally {
            await system.destroy()
        }
    })

    test('without the declaration the pre-update read and oldRecord are unchanged', async () => {
        const Doc = documentEntity('ExOrPlainDoc', false)
        const { db, system, controller } = await createSystem({ entities: [Doc] })
        try {
            await controller.setup(true)
            const doc = await system.storage.create(Doc.name, { title: 'a', body: LARGE, meta: { k: 1 } })
            const listened: any[] = []
            system.storage.listen(async events => { listened.push(...events.filter(e => e.type === 'update')) })
            const { recorded, restore } = recordQueries(db)
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { title: 'b' })
            restore()
            const selected = selectList(preUpdateReads(recorded, Doc.name)[0].sql)
            for (const attribute of ['id', 'title', 'body', 'meta']) {
                expect(selected).toContain(`"${fieldOf(system, Doc.name, attribute)}"`)
            }
            expect(listened[0].oldRecord).toEqual({ id: doc.id, title: 'a', body: LARGE, meta: { k: 1 } })
        } finally {
            await system.destroy()
        }
    })

    test('an existing database attaches with the exclusion enabled or removed', async () => {
        const db = new PGLiteDB()
        const name = 'ExOrAttach'
        const attach = async (exclude: boolean, install: boolean) => {
            const system = new MonoSystem(db)
            system.conceptClass = KlassByName
            const controller = new Controller({ system, entities: [documentEntity(name, exclude)], relations: [] })
            await controller.setup(install)
            return controller
        }
        try {
            const initial = await attach(false, true)
            const doc = await initial.system.storage.create(name, { title: 'initial', body: LARGE })
            initial.teardown()
            const match = MatchExp.atom({ key: 'id', value: ['=', doc.id] })
            for (const exclude of [true, false]) {
                const controller = await attach(exclude, false)
                const snapshots: unknown[] = []
                const storage = controller.system.storage
                storage.listen(async events => {
                    for (const event of events) if (event.recordName === name && event.type === 'update') snapshots.push(event.oldRecord)
                })
                await storage.update(name, match, { title: exclude ? 'short snapshot' : 'full snapshot' })
                expect(snapshots).toHaveLength(1)
                if (exclude) expect(snapshots[0]).not.toHaveProperty('body')
                else expect(snapshots[0]).toHaveProperty('body', LARGE)
                expect(await storage.findOne(name, match, undefined, ['body'])).toHaveProperty('body', LARGE)
                controller.teardown()
            }
        } finally {
            await db.close()
        }
    })

    test('dispatch: a StateMachine write does not read the declared column, and side effects see oldRecord without it', async () => {
        const draft = StateNode.create({ name: 'draft' })
        const published = StateNode.create({ name: 'published' })
        const Publish = Interaction.create({
            name: 'ExOrPublish',
            action: Action.create({ name: 'publish' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'docId', type: 'string' })] }),
        })
        const Doc = Entity.create({
            name: 'ExOrSmDoc',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'body', type: 'string', excludeFromOldRecord: true }),
                Property.create({
                    name: 'status',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [draft, published],
                        initialState: draft,
                        transfers: [StateTransfer.create({
                            current: draft,
                            next: published,
                            trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: Publish.name } },
                            computeTarget: (event: any) => ({ id: event.record.payload.docId }),
                        })],
                    }),
                }),
            ],
        })
        const sideEffectEvents: any[] = []
        const sideEffect = RecordMutationSideEffect.create({
            name: 'exOrSmDocSideEffect',
            record: { name: Doc.name },
            content: async (event: any) => { if (event.type === 'update') sideEffectEvents.push(event) },
        })
        const { db, system, controller } = await createSystem({ entities: [Doc], eventSources: [Publish], recordMutationSideEffects: [sideEffect] })
        try {
            await controller.setup(true)
            const doc = await system.storage.create(Doc.name, { title: 't', body: LARGE })
            const { recorded, restore } = recordQueries(db)
            const response = await controller.dispatch(Publish, { user: { id: 'u1' }, payload: { docId: doc.id } })
            restore()
            expect(response.error).toBeUndefined()

            const preReads = preUpdateReads(recorded, Doc.name)
            expect(preReads).toHaveLength(1)
            expect(selectList(preReads[0].sql)).not.toContain(`"${fieldOf(system, Doc.name, 'body')}"`)
            expect(selectList(preReads[0].sql)).toContain(`"${fieldOf(system, Doc.name, 'title')}"`)

            expect(sideEffectEvents).toHaveLength(1)
            expect(sideEffectEvents[0].keys).toEqual(['status'])
            expect(sideEffectEvents[0].oldRecord).not.toHaveProperty('body')
            expect(sideEffectEvents[0].oldRecord).toMatchObject({ id: doc.id, title: 't', status: 'draft' })

            const stored = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['status', 'body'])
            expect(stored).toMatchObject({ status: 'published', body: LARGE })
        } finally {
            await system.destroy()
        }
    })

    test('same-row nested update: in-place `&` data of an n:1 relation drops the declared relation column from oldRecord', async () => {
        const Owner = Entity.create({ name: 'ExOrOwner', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Item = Entity.create({ name: 'ExOrItem', properties: [Property.create({ name: 'label', type: 'string' })] })
        const ownershipName = 'ExOrOwnership'
        const Ownership = Relation.create({
            name: ownershipName,
            source: Item,
            sourceProperty: 'owner',
            target: Owner,
            targetProperty: 'items',
            type: 'n:1',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'note', type: 'string', excludeFromOldRecord: true }),
            ],
        })
        const { db, system, controller } = await createSystem({ entities: [Owner, Item], relations: [Ownership] })
        try {
            await controller.setup(true)
            const owner = await system.storage.create(Owner.name, { name: 'o' })
            const item = await system.storage.create(Item.name, { label: 'i', owner: { id: owner.id, '&': { role: 'r1', note: LARGE } } })
            const listened: any[] = []
            system.storage.listen(async events => { listened.push(...events.filter(e => e.type === 'update' && e.recordName === ownershipName)) })

            await system.storage.update(Item.name, MatchExp.atom({ key: 'id', value: ['=', item.id] }), { owner: { id: owner.id, '&': { role: 'r2' } } })
            expect(listened).toHaveLength(1)
            expect(listened[0].oldRecord).toMatchObject({ role: 'r1' })
            expect(listened[0].oldRecord).not.toHaveProperty('note')

            // Direct update of the relation record: the pre-update read skips the column as well.
            listened.length = 0
            const [link] = await system.storage.find(ownershipName, MatchExp.atom({ key: 'source.id', value: ['=', item.id] }), undefined, ['id'])
            const { recorded, restore } = recordQueries(db)
            await system.storage.update(ownershipName, MatchExp.atom({ key: 'id', value: ['=', link.id] }), { role: 'r3' })
            restore()
            expect(selectList(preUpdateReads(recorded, ownershipName)[0].sql)).not.toContain(`"${fieldOf(system, ownershipName, 'note')}"`)
            expect(listened).toHaveLength(1)
            expect(listened[0].oldRecord).toMatchObject({ role: 'r2' })
            expect(listened[0].oldRecord).not.toHaveProperty('note')

            const [after] = await system.storage.find(ownershipName, MatchExp.atom({ key: 'id', value: ['=', link.id] }), undefined, ['role', 'note'])
            expect(after).toMatchObject({ role: 'r3', note: LARGE })
        } finally {
            await system.destroy()
        }
    })

    test('filtered-entity membership over a declared column stays correct (membership is decided by queries, not by oldRecord)', async () => {
        const Doc = Entity.create({
            name: 'ExOrFlDoc',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'flag', type: 'string', excludeFromOldRecord: true }),
            ],
        })
        const Flagged = Entity.create({
            name: 'ExOrFlFlagged',
            baseEntity: Doc,
            matchExpression: MatchExp.atom({ key: 'flag', value: ['=', 'on'] }),
        })
        const { system, controller } = await createSystem({ entities: [Doc, Flagged] })
        try {
            await controller.setup(true)
            const doc = await system.storage.create(Doc.name, { title: 'a', flag: 'off' })
            const membership: string[] = []
            system.storage.listen(async events => {
                for (const event of events) if (event.recordName === Flagged.name) membership.push(event.type)
            })
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { flag: 'on' })
            expect(membership).toEqual(['create'])
            expect(await system.storage.find(Flagged.name, undefined, undefined, ['id'])).toHaveLength(1)
            // An update of another column keeps the record a member without membership events.
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { title: 'b' })
            expect(membership).toEqual(['create'])
            await system.storage.update(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { flag: 'off' })
            expect(membership).toEqual(['create', 'delete'])
            expect(await system.storage.find(Flagged.name, undefined, undefined, ['id'])).toHaveLength(0)
        } finally {
            await system.destroy()
        }
    })
})

async function expectSetupRejects(args: Parameters<typeof createSystem>[0], expected: RegExp) {
    const { system, controller } = await createSystem(args)
    try {
        await expect(controller.setup(true)).rejects.toThrow(expected)
    } finally {
        await system.destroy().catch(() => {})
    }
}

async function expectSetupSucceeds(args: Parameters<typeof createSystem>[0]) {
    const { system, controller } = await createSystem(args)
    try {
        await controller.setup(true)
    } finally {
        await system.destroy()
    }
}

const big = (extra: object = {}) => Property.create({ name: 'big', type: 'string', excludeFromOldRecord: true, ...extra })
const hostEntity = (name: string, ...properties: any[]) => Entity.create({
    name,
    properties: [Property.create({ name: 'label', type: 'string' }), ...properties],
})

describe('excludeFromOldRecord: setup rejects declarations whose consumers need the old value', () => {
    test('declaration: the flag must be a boolean', () => {
        expect(() => Property.create({ name: 'big', type: 'string', excludeFromOldRecord: 'yes' as any })).toThrow(/non-boolean excludeFromOldRecord/)
    })

    test('the property is computed', async () => {
        const Host = hostEntity('ExOrRjComputed', big({ computed: (record: any) => `${record.label}!` }))
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjComputed\.big" declares excludeFromOldRecord and computed/)
    })

    test('the property is the output of a computation', async () => {
        const s0 = StateNode.create({ name: 's0' })
        const Host = hostEntity('ExOrRjComputation', big({
            computation: StateMachine.create({ states: [s0], initialState: s0, transfers: [] }),
        }))
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjComputation\.big" declares excludeFromOldRecord and a computation/)
    })

    test('the property declares a defaultValue', async () => {
        const Host = hostEntity('ExOrRjDefault', big({ defaultValue: () => 'd' }))
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjDefault\.big" declares excludeFromOldRecord and a defaultValue/)
    })

    test('the property is part of Entity.identity', async () => {
        const Host = Entity.create({
            name: 'ExOrRjIdentity',
            identity: { name: 'byBig', properties: ['big'] },
            properties: [Property.create({ name: 'label', type: 'string' }), big()],
        })
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjIdentity\.big" declares excludeFromOldRecord, but it is part of the identity "byBig"/)
    })

    test('the record declares a computed property', async () => {
        const Host = hostEntity('ExOrRjSibling', big(), Property.create({ name: 'shout', type: 'string', computed: (record: any) => `${record.label}!` }))
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjSibling\.big" declares excludeFromOldRecord, but "ExOrRjSibling" also declares the computed property "shout"/)
    })

    test('the record is a filtered entity (re-declaring a base property)', async () => {
        const Base = hostEntity('ExOrRjBase', Property.create({ name: 'big', type: 'string' }))
        const View = Entity.create({
            name: 'ExOrRjView',
            baseEntity: Base,
            matchExpression: MatchExp.atom({ key: 'label', value: ['=', 'a'] }),
            properties: [big()],
        })
        await expectSetupRejects({ entities: [Base, View] }, /"ExOrRjView\.big" declares excludeFromOldRecord, but "ExOrRjView" is a filtered or merged entity/)
    })

    test('the record is an input of a merged entity', async () => {
        const InputA = hostEntity('ExOrRjInputA', big())
        const InputB = hostEntity('ExOrRjInputB')
        const Merged = Entity.create({ name: 'ExOrRjMerged', inputEntities: [InputA, InputB] })
        await expectSetupRejects({ entities: [InputA, InputB, Merged] }, /"ExOrRjInputA\.big" declares excludeFromOldRecord, but "ExOrRjInputA" is a merged-input entity/)
    })

    test('a data-based computation matches on it (records dataDep match)', async () => {
        const Host = hostEntity('ExOrRjDepMatch', big())
        const total = Dictionary.create({
            name: 'exOrRjBigOnCount',
            type: 'number',
            computation: Custom.create({
                name: 'ExOrRjDepMatchCustom',
                dataDeps: {
                    hosts: { type: 'records', source: Host, match: MatchExp.atom({ key: 'big', value: ['=', 'on'] }), attributeQuery: ['id'] },
                },
                compute: async (deps: any) => deps.hosts.length,
                getInitialValue: () => 0,
            }),
        })
        await expectSetupRejects({ entities: [Host], dict: [total] }, /"ExOrRjDepMatch\.big" declares excludeFromOldRecord, but Custom computation of global "exOrRjBigOnCount" filters on it in the match of a records dataDep/)
    })

    test.each(['record', 'oldRecord'] as const)('a StateMachine trigger matches it in the %s pattern of an update', async (side) => {
        const s0 = StateNode.create({ name: 's0' })
        const s1 = StateNode.create({ name: 's1' })
        const name = `ExOrRjTrigger_${side}`
        const Host = hostEntity(name, big(), Property.create({
            name: 'phase',
            type: 'string',
            computation: StateMachine.create({
                states: [s0, s1],
                initialState: s0,
                transfers: [StateTransfer.create({
                    current: s0,
                    next: s1,
                    trigger: { recordName: name, type: 'update', [side]: { big: 'on' } } as any,
                    computeTarget: (event: any) => ({ id: event.record.id }),
                })],
            }),
        }))
        await expectSetupRejects({ entities: [Host] }, new RegExp(`"${name}\\.big" declares excludeFromOldRecord, but StateMachine computation of property "${name}\\.phase" matches it in the \`${side}\` pattern`))
    })

    test('a ScopedSequence uses it as a scope value field', async () => {
        const Host = hostEntity('ExOrRjScope', big(), Property.create({
            name: 'serial',
            type: 'number',
            computation: ScopedSequence.create({
                name: 'ExOrRjScopeSerial',
                scope: [{ name: 'bucket', type: 'string', path: 'big' }],
                initialValue: 0,
                step: 1,
            }),
        }))
        await expectSetupRejects({ entities: [Host] }, /"ExOrRjScope\.big" declares excludeFromOldRecord, but it is a scope field of the ScopedSequence "ExOrRjScopeSerial"/)
    })
})

describe('excludeFromOldRecord: legal neighbors set up', () => {

    test('data-based computations that read the column through dataDeps keep correct values (dataDep values are re-queried)', async () => {
        const Child = hostEntity('ExOrLgChild', big(), Property.create({
            name: 'bigLength',
            type: 'number',
            computation: Custom.create({
                name: 'ExOrLgChildLength',
                dataDeps: { self: { type: 'property', attributeQuery: ['big'] } },
                compute: async (deps: any) => (deps.self?.big ?? '').length,
                getInitialValue: () => 0,
            }),
        }))
        const Parent = Entity.create({ name: 'ExOrLgParent', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Children = Relation.create({ name: 'ExOrLgChildren', source: Parent, sourceProperty: 'children', target: Child, targetProperty: 'parent', type: '1:n' })
        Parent.properties.push(Property.create({
            name: 'onChildren',
            type: 'number',
            computation: Count.create({ property: 'children', attributeQuery: ['big'], callback: (child: any) => child.big === 'on' } as any),
        }))
        const Copy = Entity.create({
            name: 'ExOrLgCopy',
            properties: [Property.create({ name: 'copy', type: 'string' })],
            computation: Transform.create({ record: Child, attributeQuery: ['label', 'big'], callback: (record: any) => ({ copy: `${record.label}:${record.big}` }) }),
        })
        const StarCopy = Entity.create({
            name: 'ExOrLgStarCopy',
            properties: [Property.create({ name: 'copy', type: 'string' })],
            computation: Transform.create({ record: Child, attributeQuery: ['*'], callback: (record: any) => ({ copy: `${record.label}:${record.big}` }) }),
        })
        const { system, controller } = await createSystem({ entities: [Child, Parent, Copy, StarCopy], relations: [Children] })
        const one = async (recordName: string, id: unknown, attributeQuery: string[]) =>
            system.storage.findOne(recordName, MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, attributeQuery)
        try {
            await controller.setup(true)
            const parent = await system.storage.create(Parent.name, { name: 'p' })
            const child = await system.storage.create(Child.name, { label: 'a', big: 'on', parent: { id: parent.id } })
            const expectState = async (label: string, bigValue: string, onChildren: number) => {
                expect(await one(Child.name, child.id, ['bigLength'])).toMatchObject({ bigLength: bigValue.length })
                expect(await one(Parent.name, parent.id, ['onChildren'])).toMatchObject({ onChildren })
                expect((await system.storage.find(Copy.name, undefined, undefined, ['copy'])).map((row: any) => row.copy)).toEqual([`${label}:${bigValue}`])
                expect((await system.storage.find(StarCopy.name, undefined, undefined, ['copy'])).map((row: any) => row.copy)).toEqual([`${label}:${bigValue}`])
            }
            await expectState('a', 'on', 1)
            await system.storage.update(Child.name, MatchExp.atom({ key: 'id', value: ['=', child.id] }), { big: 'off!' })
            await expectState('a', 'off!', 0)
            await system.storage.update(Child.name, MatchExp.atom({ key: 'id', value: ['=', child.id] }), { label: 'b' })
            await expectState('b', 'off!', 0)
            await system.storage.update(Child.name, MatchExp.atom({ key: 'id', value: ['=', child.id] }), { big: 'on' })
            await expectState('b', 'on', 1)
        } finally {
            await system.destroy()
        }
    })
    test('computations and triggers that do not depend on the declared column', async () => {
        const s0 = StateNode.create({ name: 's0' })
        const s1 = StateNode.create({ name: 's1' })
        const Host = hostEntity('ExOrLgHost', big(), Property.create({
            name: 'phase',
            type: 'string',
            computation: StateMachine.create({
                states: [s0, s1],
                initialState: s0,
                transfers: [StateTransfer.create({
                    current: s0,
                    next: s1,
                    // keys-only and other-field patterns do not read the old value of "big".
                    trigger: { recordName: 'ExOrLgHost', type: 'update', keys: ['big'], record: { label: 'go' } },
                    computeTarget: (event: any) => ({ id: event.record.id }),
                })],
            }),
        }))
        const Derived = Entity.create({
            name: 'ExOrLgDerived',
            properties: [Property.create({ name: 'copy', type: 'string' })],
            computation: Transform.create({ record: Host, attributeQuery: ['label'], callback: (record: any) => ({ copy: record.label }) }),
        })
        await expectSetupSucceeds({ entities: [Host, Derived] })
    })
})
