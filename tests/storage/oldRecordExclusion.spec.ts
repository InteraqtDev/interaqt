import { describe, expect, test } from 'vitest'
import { Entity, Property, Relation } from '@core'
import { PGLiteDB } from '@drivers'
import { StateMachine, StateNode, type RecordMutationEvent } from 'interaqt'
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from '@storage'
import { OldRecordExclusionError } from '../../src/storage/erstorage/oldRecordExclusion.js'

const label = () => Property.create({ name: 'label', type: 'string' })
const body = (excludeFromOldRecord: boolean) => Property.create({ name: 'body', type: 'string', excludeFromOldRecord })
const active = MatchExp.atom({ key: 'label', value: ['=', 'active'] })

describe('excludeFromOldRecord in standalone storage setup', () => {
    test.each(['entity', 'relation'] as const)('rejects a default on an excluded %s column', kind => {
        const property = Property.create({
            name: 'body',
            type: 'string',
            defaultValue: () => 'default',
            excludeFromOldRecord: true,
        })
        const source = Entity.create({ name: 'Source', properties: kind === 'entity' ? [property] : [] })
        const target = Entity.create({ name: 'Target' })
        const db = new PGLiteDB()
        if (kind === 'entity') {
            expect(() => new DBSetup([source, target], [], db)).toThrow(OldRecordExclusionError)
            expect(() => new DBSetup([source, target], [], db)).toThrow(/"Source.body" declares excludeFromOldRecord and a defaultValue/)
        } else {
            const link = Relation.create({
                source,
                sourceProperty: 'targets',
                target,
                targetProperty: 'sources',
                type: 'n:n',
                properties: [property],
            })
            expect(() => new DBSetup([source, target], [link], db)).toThrow(/"Source_targets_sources_Target.body" declares excludeFromOldRecord and a defaultValue/)
        }
    })

    test('rejects an exclusion redeclared by a filtered entity', () => {
        const base = Entity.create({ name: 'Base', properties: [label(), body(false)] })
        const view = Entity.create({ name: 'View', baseEntity: base, matchExpression: active, properties: [body(true)] })
        expect(() => new DBSetup([base, view], [], new PGLiteDB())).toThrow(/"View.body" declares excludeFromOldRecord.*filtered or merged entity/)
    })

    test('rejects an excluded base column used as a filtered computation output', () => {
        const base = Entity.create({ name: 'Base', properties: [label(), body(true)] })
        const initial = StateNode.create({ name: 'initial' })
        const view = Entity.create({
            name: 'View',
            baseEntity: base,
            matchExpression: active,
            properties: [Property.create({
                name: 'body',
                type: 'string',
                computation: StateMachine.create({ states: [initial], initialState: initial, transfers: [] }),
            })],
        })
        expect(() => new DBSetup([base, view], [], new PGLiteDB())).toThrow(/"Base.body" declares excludeFromOldRecord.*filtered record "View"/)
    })

    test('rejects an exclusion declared as a merged common property', () => {
        const first = Entity.create({ name: 'First', properties: [body(false)] })
        const second = Entity.create({ name: 'Second', properties: [body(false)] })
        const merged = Entity.create({ name: 'Merged', inputEntities: [first, second], commonProperties: [body(true)] })
        expect(() => new DBSetup([first, second, merged], [], new PGLiteDB())).toThrow(/"Merged.body" declares excludeFromOldRecord.*filtered or merged entity/)
    })

    test('rejects an exclusion on the base of a filtered merged input', () => {
        const base = Entity.create({ name: 'Base', properties: [label(), body(true)] })
        const view = Entity.create({ name: 'View', baseEntity: base, matchExpression: active })
        const other = Entity.create({ name: 'Other' })
        const merged = Entity.create({ name: 'Merged', inputEntities: [view, other] })
        expect(() => new DBSetup([base, view, other, merged], [], new PGLiteDB())).toThrow(/"Base.body" declares excludeFromOldRecord.*merged-input entity/)
    })

    test('updates a filtered view without writing the omitted base column', async () => {
        const base = Entity.create({ name: 'Base', properties: [label(), body(true)] })
        const view = Entity.create({ name: 'View', baseEntity: base, matchExpression: active })
        const db = new PGLiteDB()
        await db.open()
        try {
            const setup = new DBSetup([base, view], [], db)
            await setup.createTables()
            const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
            const row = await handle.create(base.name, { label: 'active', body: 'before update' })
            const match = MatchExp.atom({ key: 'id', value: ['=', row.id] })
            const events: RecordMutationEvent[] = []

            await handle.update(view.name, match, { label: 'inactive' }, events)

            expect(events.find(event => event.type === 'update' && event.recordName === base.name)?.oldRecord)
                .toEqual({ id: row.id, label: 'active' })
            expect(await handle.findOne(base.name, match, undefined, ['label', 'body']))
                .toMatchObject({ label: 'inactive', body: 'before update' })
        } finally {
            await db.close()
        }
    })
})
