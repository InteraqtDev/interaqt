import {assertType, describe, test} from "vitest";
import {Entity, Relation} from "../entity/Entity.js";
import {InertKlassInstance, Klass, KlassInstance, KlassProp} from "../createClass.js";
import { BoolAtomData, BoolExpressionData } from "../BoolExp.js";
import {
    ActivityGroup,
    ActivityGroupPublicType,
    Gateway,
    GatewayPublicType,
    Interaction,
    InteractionInstanceType,
    InteractionPublicType,
    TransferInstanceType,
    TransferPublicType
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
        assertType<TransferInstanceType["source"]>({} as InteractionInstanceType)
        assertType<KlassInstance<Klass<TransferPublicType>, false>["source"]>({} as InteractionInstanceType)
    })


    test('attributive types', () => {
        assertType<KlassInstance<typeof BoolExpressionData, false>|KlassInstance<typeof BoolAtomData, false>>(({left: {}} as unknown as  KlassInstance<typeof BoolExpressionData, false>).left)
    })
})



