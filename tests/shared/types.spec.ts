import {assertType, describe, test} from "vitest";
import {
    ActivityGroup,
    ActivityGroupInstanceType,
    ActivityGroupPublicType,
    ActivityInstanceType,
    Gateway,
    GatewayPublicType,
    Interaction,
    InteractionInstanceType,
    InteractionPublicType,
    Transfer,
    TransferInstanceType,
    TransferPublicType,
    GetAction,
    Entity, Property, PropertyTypes, Relation,
    createClass, Klass, KlassInstance, KlassInstanceOfPublic, KlassProp,
    BoolAtomData, BoolExpressionData
} from "@shared";


assertType<(Klass<InteractionPublicType> | Klass<ActivityGroupPublicType> | Klass<GatewayPublicType>)[]>(
    [Interaction, ActivityGroup, Gateway]
)

type MapSource = TransferPublicType['source']['type'] extends Klass<infer SUB_T>[] ?
    KlassProp<TransferPublicType['source']["collection"], KlassInstanceOfPublic<SUB_T>> : number



describe("createClass types", () => {
    test('relation types', () => {

        const relation = Relation.create({
            source: Entity.create({name: 'test'}),
            target: Entity.create({name: 'test2'}),
            type: '1:1',
            sourceProperty: 'to2',
            targetProperty: 'to1',
        })
        assertType<string>(relation.source.name)
    })

    test('activity types', () => {
        assertType<TransferPublicType["source"]["type"] extends Klass<any>[] ? true : false>(true)
        assertType<number>({} as MapSource)
        assertType<keyof (typeof Transfer)["public"]>({} as 'source'|'target'|'name')
        assertType<keyof TransferInstanceType>({} as  'source'|'target'|'name')
        assertType<TransferInstanceType["source"]>({} as InteractionInstanceType|ActivityInstanceType|ActivityGroupInstanceType)
        assertType<KlassInstanceOfPublic<TransferPublicType>["source"]>({} as InteractionInstanceType)
    })


    test('attributive types', () => {
        assertType<KlassInstance<typeof BoolExpressionData>|KlassInstance<typeof BoolAtomData>>(({left: {}} as unknown as KlassInstance<typeof BoolExpressionData>).left)
    })


    test('entity and relation types', () => {
        const WeightedSummation = createClass({
            name: 'WeightedSummation1',
            public: {
                records: {
                    type: [Entity, Relation],
                    collection: true,
                    required: true,
                },
            }
        })

        assertType<KlassInstance<any>[]>({} as unknown as KlassInstance<typeof WeightedSummation>["records"])
        assertType<KlassInstance<typeof WeightedSummation>["records"]>([] as unknown as KlassInstance<typeof Entity>[]|KlassInstance<typeof Relation>[])
    })

    test('KlassInstance too complex test', () => {
        const TestClass = createClass({
            name: 'TestClass',
            public: {
                content: {
                    type: 'function',
                    required: true,
                    collection: false
                },
                computation: {
                    type: [] as Klass<any>[],
                    collection: false,
                    required: false,
                }
            }
        });
        
        assertType<"content"|"uuid"|"_options"|"_type"|"computation">({} as unknown as keyof KlassInstance<typeof TestClass>)
        assertType<KlassInstance<typeof TestClass>["content"]>({} as unknown as (...arg: any[]) => any )
        assertType<(...arg: any[]) => any >({} as unknown as KlassInstance<typeof TestClass>["content"])
        assertType<KlassInstance<typeof TestClass>["uuid"]>({} as unknown as string )
    })

    test('entity type', () => {
        const testEntity = Entity.create({
            name: 'test',

        })

        assertType<any[]>(testEntity.properties)
        assertType<typeof testEntity.properties>([] as any[])
    })

    test('create KlassInstance', () => {
        const NewClassType = createClass({
            name: 'NewClass',
            public: {
                name: {type: 'string', required: true},
            }
        })
        
        const i1 = NewClassType.create({name: 'get'})
        const i2 = NewClassType.create({name: 'get'})
        const i3 = NewClassType.create({name: 'get'})
        
        assertType<KlassInstanceOfPublic<{name: {type: 'string', required: true}}>>(i1)
        assertType<KlassInstanceOfPublic<{name: {type: 'string', required: true}}>>(i2)
        assertType<KlassInstanceOfPublic<{name: {type: 'string', required: true}}>>(i3)


        const p1 = Property.create({name: 'role', type: PropertyTypes.String});
        assertType<KlassInstanceOfPublic<{name: {type: 'string', required: true}}>>(p1)
        const UserEntity = Entity.create({
            name: 'User',
            properties: [p1],
        });
    })

    test('get action type', () => {
        assertType<typeof GetAction>( {} as unknown as KlassInstanceOfPublic<{name: {type: 'string', required: true}}>)
    })
})



type TestKlass = Klass<{
    content: {
        type: 'function',
        required: true,
        collection: false
    },
    computation: {
        // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
        type: Klass<any>[],
        collection: false,
        required: false,
    },
}>
