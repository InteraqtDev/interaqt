import { describe, expect, test, vi } from 'vitest'
import {
    Controller, Count, Custom, Dictionary, Entity, KlassByName,
    MatchExp, MonoSystem, Property, Relation,
    type DataBasedComputation, type DataContext,
} from 'interaqt'
import { PGLiteDB } from '@drivers'

describe('excludeFromOldRecord computation routing', () => {
    test('a write of undefined invalidates explicit, wildcard, and related data dependencies', async () => {
        const computeOrdinary = vi.fn(({ self }: { self: { ordinary: string } }) => self.ordinary)
        const Child = Entity.create({
            name: 'ExcludedRoutingChild',
            properties: [
                Property.create({ name: 'body', type: 'string', excludeFromOldRecord: true }),
                Property.create({ name: 'ordinary', type: 'string' }),
                Property.create({
                    name: 'ordinaryCopy',
                    type: 'string',
                    computation: Custom.create({
                        name: 'ExcludedRoutingOrdinary',
                        dataDeps: { self: { type: 'property', attributeQuery: ['ordinary'] } },
                        compute: computeOrdinary,
                    }),
                }),
            ],
        })
        const Parent = Entity.create({
            name: 'ExcludedRoutingParent',
            properties: [Property.create({
                name: 'populatedChildren',
                type: 'number',
                computation: Count.create({
                    property: 'children',
                    attributeQuery: ['body'],
                    callback: (child: { body?: string | null }) => child.body === 'content',
                }),
            })],
        })
        const Children = Relation.create({
            name: 'ExcludedRoutingChildren',
            source: Parent,
            sourceProperty: 'children',
            target: Child,
            targetProperty: 'parent',
            type: '1:n',
        })
        const bodyLengthDictionary = (name: string, attributeQuery: string[]) => Dictionary.create({
            name,
            type: 'number',
            computation: Custom.create({
                name,
                dataDeps: { children: { type: 'records', source: Child, attributeQuery } },
                compute: ({ children }: { children: { body?: string | null }[] }) =>
                    children.reduce((sum, child) => sum + (child.body?.length ?? 0), 0),
            }),
        })
        const explicitBodyLength = bodyLengthDictionary('excludedRoutingExplicitBodyLength', ['body'])
        const wildcardBodyLength = bodyLengthDictionary('excludedRoutingWildcardBodyLength', ['*'])
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [Parent, Child],
            relations: [Children],
            dict: [explicitBodyLength, wildcardBodyLength],
        })

        try {
            await controller.setup(true)
            const parent = await system.storage.create(Parent.name, {})
            const child = await system.storage.create(Child.name, {
                body: 'content', ordinary: 'keep', parent: { id: parent.id },
            })
            const parentMatch = MatchExp.atom({ key: 'id', value: ['=', parent.id] })
            const childMatch = MatchExp.atom({ key: 'id', value: ['=', child.id] })
            const assertDerivedValues = async (bodyLength: number, populatedChildren: number) => {
                const explicitLength = await controller.retrieveLastValue({ type: 'global', id: explicitBodyLength })
                const wildcardLength = await controller.retrieveLastValue({ type: 'global', id: wildcardBodyLength })
                const storedParent = await system.storage.findOne(Parent.name, parentMatch, undefined, ['populatedChildren'])
                expect.soft(explicitLength, 'explicit dependency').toBe(bodyLength)
                expect.soft(wildcardLength, 'wildcard dependency').toBe(bodyLength)
                expect.soft(storedParent, 'related dependency').toMatchObject({ populatedChildren })
            }
            await assertDerivedValues(7, 1)
            computeOrdinary.mockClear()

            await controller.runInBusinessTransaction({ name: 'clearBody', isolation: 'SERIALIZABLE' }, async () => {
                await system.storage.update(Child.name, childMatch, { body: undefined, ordinary: 'keep' })
            })

            const storedChild = await system.storage.findOne(Child.name, childMatch, undefined, ['body'])
            expect(storedChild).toMatchObject({ id: child.id })
            expect(storedChild).not.toHaveProperty('body')
            await assertDerivedValues(0, 0)
            expect(computeOrdinary).not.toHaveBeenCalled()
        } finally {
            await system.destroy()
        }
    })

    test.each([false, true])('third-party computation can use an object-valued transfers argument (exclusion=%s)', async excludeFromOldRecord => {
        class ThirdPartyDefinition {
            static displayName = 'ThirdPartyDefinition'
            uuid = 'third-party-transfer-configuration'
            transfers = { factor: 2 }
        }
        const Item = Entity.create({
            name: `ThirdPartyTransferItem${excludeFromOldRecord ? 'Excluded' : 'Ordinary'}`,
            properties: [Property.create({ name: 'value', type: 'number', excludeFromOldRecord })],
        })
        class ThirdPartyHandle implements DataBasedComputation {
            static computationType = ThirdPartyDefinition
            static contextType = 'global' as const
            state = {}
            dataDeps = { items: { type: 'records' as const, source: Item, attributeQuery: ['value'] } }
            constructor(_controller: Controller, public args: ThirdPartyDefinition, public dataContext: DataContext) {}
            async compute({ items }: { items: { value: number }[] }) {
                return items.reduce((sum, item) => sum + item.value * this.args.transfers.factor, 0)
            }
        }
        const total = Dictionary.create({
            name: 'thirdPartyTransferTotal',
            type: 'number',
            computation: new ThirdPartyDefinition() as any,
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system, entities: [Item], relations: [], dict: [total], computations: [ThirdPartyHandle],
        })

        try {
            await controller.setup(true)
            await system.storage.create(Item.name, { value: 3 })
            expect(await controller.retrieveLastValue({ type: 'global', id: total })).toBe(6)
        } finally {
            await system.destroy()
        }
    })
})
