/**
 * Column set of the row re-read that event-driven computation handles perform under a row lock.
 *
 * Symptom: applying a property StateMachine transition read the whole host row ('*') once per
 * transitioned record, and the data-based Transform update path read every value column of every
 * mapped row it locked. For hosts with wide columns (long text, JSON, embedding vectors) this moved
 * far more data than the handles consume.
 *
 * Mechanism: `PropertyStateMachineHandle.incrementalCompute` consumes exactly three fields of the
 * locked snapshot (the bound current-state column, the output property as the previous value for
 * `computeValue`, and `id`); `RecordsTransformHandle` consumes `id` and the transform index of the
 * mapped rows. The row lock is `SELECT id ... FOR UPDATE` and does not depend on the attribute query;
 * `'*'` expands to value attributes only, so the related-row pass of `lockRecord` had nothing to lock.
 *
 * These cells pin (a) the re-read column set and (b) unchanged transition / patch results, including
 * the previous value seen by `computeValue` and relation hosts in their own table and merged into an
 * entity table. Concurrency of the row lock is covered on real PostgreSQL by
 * `postgresqlConcurrency.spec.ts` ("serializes concurrent state machine transitions across worker
 * processes", "keeps transform mapped records aligned ...").
 *
 * Out of scope (unchanged): the pre-update read of `storage.update` ("find record for updating"),
 * which feeds the public `oldRecord` of update events and same-row `computed` properties.
 */
import { describe, expect, test } from 'vitest'
import {
    Action, Controller, Entity, Interaction, InteractionEventEntity, KlassByName, MatchExp, MonoSystem,
    Payload, PayloadItem, Property, Relation, StateMachine, StateNode, StateTransfer, Transform,
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
    const map = (system.storage as any).queryHandle.map
    return map.getInfo(recordName, attributeName).field as string
}

/** Physical columns (among `candidates`) that appear in the SELECT list of `sql`. */
function selectedColumns(sql: string, candidates: Record<string, string>): string[] {
    const selectList = sql.slice(0, sql.search(/\bFROM\b/))
    return Object.entries(candidates)
        .filter(([, field]) => selectList.includes(`"${field}"`))
        .map(([attributeName]) => attributeName)
        .sort()
}

/** The value re-read that `atomic.lockRecord(recordName, ...)` issues right after its FOR UPDATE. */
function lockRecordReReads(recorded: RecordedQuery[], recordName: string): RecordedQuery[] {
    const result: RecordedQuery[] = []
    recorded.forEach((query, index) => {
        if (query.name === `atomic lockRecord ${recordName}` && /FOR UPDATE/.test(query.sql)) {
            result.push(recorded[index + 1])
        }
    })
    return result
}

describe('property StateMachine transition reads only the columns it consumes from the locked row', () => {
    function createFixture() {
        const draft = StateNode.create({ name: 'draft' })
        const published = StateNode.create({ name: 'published' })
        const archived = StateNode.create({ name: 'archived' })
        const counting = StateNode.create({
            name: 'counting',
            computeValue: (lastValue: unknown) => ((lastValue as number | null | undefined) ?? 0) + 1,
        })
        const Publish = Interaction.create({
            name: 'LockReadPublish',
            action: Action.create({ name: 'publish' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'docId', type: 'string' })] }),
        })
        const Archive = Interaction.create({
            name: 'LockReadArchive',
            action: Action.create({ name: 'archive' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'docId', type: 'string' })] }),
        })
        const onInteraction = (interaction: { name: string }) => ({
            recordName: InteractionEventEntity.name,
            type: 'create' as const,
            record: { interactionName: interaction.name },
        })
        const targetDoc = (event: any) => ({ id: event.record.payload.docId })
        const Doc = Entity.create({
            name: 'LockReadDoc',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'largeBody', type: 'string' }),
                Property.create({ name: 'metadata', type: 'json' }),
                Property.create({
                    name: 'status',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [draft, published, archived],
                        initialState: draft,
                        transfers: [
                            StateTransfer.create({ current: draft, next: published, trigger: onInteraction(Publish), computeTarget: targetDoc }),
                            StateTransfer.create({ current: published, next: archived, trigger: onInteraction(Archive), computeTarget: targetDoc }),
                        ],
                    }),
                }),
                Property.create({
                    name: 'publishCount',
                    type: 'number',
                    computation: StateMachine.create({
                        states: [counting],
                        initialState: counting,
                        transfers: [
                            StateTransfer.create({ current: counting, next: counting, trigger: onInteraction(Publish), computeTarget: targetDoc }),
                        ],
                    }),
                }),
            ],
        })
        return { Doc, Publish, Archive }
    }

    test('host entity: the re-read selects id, the bound state, and the output property; transitions are unchanged', async () => {
        const { Doc, Publish, Archive } = createFixture()
        const db = new PGLiteDB()
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Doc], relations: [], eventSources: [Publish, Archive] })
        try {
            await controller.setup(true)
            const doc = await system.storage.create(Doc.name, {
                title: 't', largeBody: 'x'.repeat(4096), metadata: { nested: { a: 1 } },
            })
            // computeValue of the initial state runs at creation: the counter starts at 1.
            const created = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['publishCount'])
            expect(created.publishCount).toBe(1)
            const columns = {
                id: fieldOf(system, Doc.name, 'id'),
                title: fieldOf(system, Doc.name, 'title'),
                largeBody: fieldOf(system, Doc.name, 'largeBody'),
                metadata: fieldOf(system, Doc.name, 'metadata'),
                status: fieldOf(system, Doc.name, 'status'),
                publishCount: fieldOf(system, Doc.name, 'publishCount'),
                statusState: fieldOf(system, Doc.name, '_LockReadDoc_status_bound_currentState'),
                publishCountState: fieldOf(system, Doc.name, '_LockReadDoc_publishCount_bound_currentState'),
            }

            const { recorded, restore } = recordQueries(db)
            const first = await controller.dispatch(Publish, { user: { id: 'u1' }, payload: { docId: doc.id } })
            restore()
            expect(first.error).toBeUndefined()

            const reReads = lockRecordReReads(recorded, Doc.name)
            // One locked re-read per transitioned property (status, publishCount).
            expect(reReads).toHaveLength(2)
            const readSets = reReads.map(query => selectedColumns(query.sql, columns)).sort((a, b) => a.join().localeCompare(b.join()))
            expect(readSets).toEqual([
                ['id', 'publishCount', 'publishCountState'],
                ['id', 'status', 'statusState'],
            ])

            // Transition results: draft -> published; computeValue received the previous value.
            let stored = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['*'])
            expect(stored.status).toBe('published')
            expect(stored.publishCount).toBe(2)
            expect(stored.largeBody).toBe('x'.repeat(4096))
            expect(stored.metadata).toEqual({ nested: { a: 1 } })

            // A second Publish: status has no transfer out of 'published' (skip), the counter advances
            // from the previous value read under the lock.
            expect((await controller.dispatch(Publish, { user: { id: 'u1' }, payload: { docId: doc.id } })).error).toBeUndefined()
            // published -> archived: the current state is taken from the narrowed snapshot.
            expect((await controller.dispatch(Archive, { user: { id: 'u1' }, payload: { docId: doc.id } })).error).toBeUndefined()
            stored = await system.storage.findOne(Doc.name, MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['*'])
            expect(stored.status).toBe('archived')
            expect(stored.publishCount).toBe(3)
        } finally {
            await system.destroy()
        }
    })

    test.each(['n:n', 'n:1'] as const)('host relation (%s): the re-read selects only the consumed columns; transition is unchanged', async (relationType) => {
        const active = StateNode.create({ name: 'active' })
        const ended = StateNode.create({ name: 'ended' })
        const End = Interaction.create({
            name: `LockReadEnd_${relationType.replace(':', '')}`,
            action: Action.create({ name: 'end' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'membershipId', type: 'string' })] }),
        })
        const Member = Entity.create({ name: `LockReadMember_${relationType.replace(':', '')}`, properties: [Property.create({ name: 'name', type: 'string' })] })
        const Group = Entity.create({ name: `LockReadGroup_${relationType.replace(':', '')}`, properties: [Property.create({ name: 'name', type: 'string' })] })
        const membershipName = `LockReadMembership_${relationType.replace(':', '')}`
        const Membership = Relation.create({
            name: membershipName,
            source: Member,
            sourceProperty: 'groups',
            target: Group,
            targetProperty: 'members',
            type: relationType,
            properties: [
                Property.create({ name: 'note', type: 'string' }),
                Property.create({
                    name: 'phase',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [active, ended],
                        initialState: active,
                        transfers: [
                            StateTransfer.create({
                                current: active,
                                next: ended,
                                trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: End.name } },
                                computeTarget: (event: any) => ({ id: event.record.payload.membershipId }),
                            }),
                        ],
                    }),
                }),
            ],
        })
        const db = new PGLiteDB()
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Member, Group], relations: [Membership], eventSources: [End] })
        try {
            await controller.setup(true)
            const group = await system.storage.create(Group.name, { name: 'g' })
            const member = await system.storage.create(Member.name, { name: 'm', groups: [{ id: group.id, '&': { note: 'n'.repeat(2048) } }] })
            const [link] = await system.storage.find(membershipName, MatchExp.atom({ key: 'source.id', value: ['=', member.id] }), undefined, ['id', 'note', 'phase'])
            expect(link.phase).toBe('active')
            const columns = {
                id: fieldOf(system, membershipName, 'id'),
                note: fieldOf(system, membershipName, 'note'),
                phase: fieldOf(system, membershipName, 'phase'),
                phaseState: fieldOf(system, membershipName, `_${membershipName}_phase_bound_currentState`),
            }

            const { recorded, restore } = recordQueries(db)
            const response = await controller.dispatch(End, { user: { id: 'u1' }, payload: { membershipId: link.id } })
            restore()
            expect(response.error).toBeUndefined()

            const reReads = lockRecordReReads(recorded, membershipName)
            expect(reReads).toHaveLength(1)
            expect(selectedColumns(reReads[0].sql, columns)).toEqual(['id', 'phase', 'phaseState'])

            const [after] = await system.storage.find(membershipName, MatchExp.atom({ key: 'id', value: ['=', link.id] }), undefined, ['id', 'note', 'phase'])
            expect(after.phase).toBe('ended')
            expect(after.note).toBe('n'.repeat(2048))
        } finally {
            await system.destroy()
        }
    })
})

describe('data-based Transform update path reads only id and the transform index of the mapped rows it locks', () => {
    test('source update: mapped rows are updated and deleted exactly as before', async () => {
        const Source = Entity.create({
            name: 'LockReadTfSource',
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
            ],
        })
        const Derived = Entity.create({
            name: 'LockReadTfDerived',
            properties: [
                Property.create({ name: 'derivedLabel', type: 'string' }),
                Property.create({ name: 'derivedPayload', type: 'string' }),
            ],
            computation: Transform.create({
                record: Source,
                attributeQuery: ['label', 'value'],
                // Two mapped rows while value > 5, one otherwise: an update can both update and delete.
                callback: (record: any) => {
                    const first = { derivedLabel: `${record.label}#0`, derivedPayload: 'p'.repeat(2048) }
                    return record.value > 5 ? [first, { derivedLabel: `${record.label}#1`, derivedPayload: 'q'.repeat(2048) }] : [first]
                },
            }),
        })
        const db = new PGLiteDB()
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({ system, entities: [Source, Derived], relations: [] })
        try {
            await controller.setup(true)
            const source = await system.storage.create(Source.name, { label: 'a', value: 10 })
            let derived = await system.storage.find(Derived.name, undefined, undefined, ['derivedLabel'])
            expect(derived.map(row => row.derivedLabel).sort()).toEqual(['a#0', 'a#1'])

            const columns = {
                id: fieldOf(system, Derived.name, 'id'),
                derivedLabel: fieldOf(system, Derived.name, 'derivedLabel'),
                derivedPayload: fieldOf(system, Derived.name, 'derivedPayload'),
                transformIndex: fieldOf(system, Derived.name, `_${Derived.name}_bound_transformIndex`),
                sourceRecordId: fieldOf(system, Derived.name, `_${Derived.name}_bound_sourceRecordId`),
            }

            const { recorded, restore } = recordQueries(db)
            await system.storage.update(Source.name, MatchExp.atom({ key: 'id', value: ['=', source.id] }), { label: 'b', value: 3 })
            restore()

            const lockIndex = recorded.findIndex(query => query.name.startsWith(`atomic lockRows ${Derived.name}`))
            expect(lockIndex).toBeGreaterThan(-1)
            // Reads lockRows issues on the mapped table: the stabilization reads (id only) and the final
            // read that is returned to the handle.
            const lockRowsReads = recorded.slice(lockIndex)
                .filter(query => query.name === `finding ${Derived.name} from handle`)
            expect(lockRowsReads.length).toBeGreaterThan(0)
            const readSets = lockRowsReads.map(query => selectedColumns(query.sql, columns))
            for (const readSet of readSets) {
                expect(readSet).not.toContain('derivedLabel')
                expect(readSet).not.toContain('derivedPayload')
            }
            // The read returned to the handle (the match on sourceRecordId is in WHERE, not selected).
            expect(readSets).toContainEqual(['id', 'transformIndex'])

            derived = await system.storage.find(Derived.name, undefined, undefined, ['derivedLabel', 'derivedPayload'])
            expect(derived).toHaveLength(1)
            expect(derived[0].derivedLabel).toBe('b#0')
            expect(derived[0].derivedPayload).toBe('p'.repeat(2048))
        } finally {
            await system.destroy()
        }
    })
})
