import {assertType, describe, test} from "vitest";
import {Entity, Relation} from "../entity/Entity.js";
import {createClass, InertKlassInstance, Klass, KlassInstance, KlassProp, ReactiveKlassInstance} from "../createClass.js";
import {BoolAtomData, BoolExpressionData} from "../BoolExp.js";
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
    GetAction
} from "../activity/Activity.js";


assertType<(Klass<InteractionPublicType> | Klass<ActivityGroupPublicType> | Klass<GatewayPublicType>)[]>(
    [Interaction, ActivityGroup, Gateway]
)

type MapSource = TransferPublicType['source']['type'] extends Klass<infer SUB_T>[] ?
    KlassProp<false, TransferPublicType['source']["collection"], InertKlassInstance<SUB_T>> : number



describe("createClass types", () => {
    test('relation types', () => {

        const relation = Relation.create({
            source: Entity.create({name: 'test'}),
            target: Entity.create({name: 'test2'}),
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
        assertType<KlassInstance<Klass<TransferPublicType>, false>["source"]>({} as InteractionInstanceType)
    })


    test('attributive types', () => {
        assertType<KlassInstance<typeof BoolExpressionData, false>|KlassInstance<typeof BoolAtomData, false>>(({left: {}} as unknown as  KlassInstance<typeof BoolExpressionData, false>).left)
    })


    test('entity and relation types', () => {
        const WeightedSummation = createClass({
            name: 'WeightedSummation',
            public: {
                records: {
                    type: [Entity, Relation],
                    collection: true,
                    required: true,
                },
            }
        })

        assertType<KlassInstance<any, false>[]>({} as unknown as KlassInstance<typeof WeightedSummation, false>["records"])
        assertType<KlassInstance<typeof WeightedSummation, false>["records"]>([] as unknown as KlassInstance<typeof Entity, false>[]|KlassInstance<typeof Relation,false>[])
    })

    test('KlassInstance too complex test', () => {
        assertType<"content"|"uuid"|"_options"|"_type"|"computedData">({} as unknown as keyof KlassInstance<TestKlass, false>)
        assertType<KlassInstance<TestKlass, false>["content"]>({} as unknown as (...arg: any[]) => any )
        assertType<(...arg: any[]) => any >({} as unknown as KlassInstance<TestKlass, false>["content"])
        assertType<KlassInstance<TestKlass, false>["uuid"]>({} as unknown as string )
        // assertType<Klass<TestKlass>|undefined>({} as unknown as KlassInstance<TestKlass, false>["computedData"] )
    })

    test('entity type', () => {
        const testEntity = Entity.create({
            name: 'test',

        })

        assertType<any[]>(testEntity.properties)
        assertType<typeof testEntity.properties>([] as any[])
    })

    test('create ReactiveKlassInstance and InkertKlassType', () => {
        const NewClassType = createClass({
            name: 'NewClass',
            public: {
                name: {type: 'string', required: true},
            }
        })
        
        const i1 = NewClassType.create({name: 'get'}, {isReactive: true})
        const i2 = NewClassType.create({name: 'get'}, {isReactive: false})
        const i3 = NewClassType.create({name: 'get'})
        
        assertType<ReactiveKlassInstance<{name: {type: 'string', required: true}}>>(i1)
        assertType<InertKlassInstance<{name: {type: 'string', required: true}}>>(i2)
        assertType<InertKlassInstance<{name: {type: 'string', required: true}}>>(i3)
    })

    test('get action type', () => {
        assertType<typeof GetAction>( {} as unknown as InertKlassInstance<{name: {type: 'string', required: true}}>)
    })
})



type TestKlass = {
    public: {
        content: {
            type: 'function',
            required: true,
            collection: false
        },
        computedData: {
            // CAUTION 这里的具体类型等着外面注册 IncrementalComputationHandle 的时候修补
            type: Klass<any>[],
            collection: false,
            required: false,
        },
    }
}
