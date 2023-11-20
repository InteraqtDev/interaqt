import {assertType, describe, test} from "vitest";
import {Entity, Relation} from "../entity/Entity";
import {InertKlassInstance, Klass, KlassInstance, KlassProp} from "../createClass";
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
} from "../activity/Activity";


assertType<(Klass<InteractionPublicType>| Klass<ActivityGroupPublicType>| Klass<GatewayPublicType>)[]>(
    [Interaction, ActivityGroup, Gateway]
)

type MapSource = TransferPublicType['source']['type'] extends Klass<infer SUB_T>[] ?
    KlassProp<false, TransferPublicType['source']["collection"],InertKlassInstance<SUB_T>>: number

describe("createClass types", () => {
  test('relation types', () => {

      const relation = Relation.create({
          entity1: Entity.create({ name: 'test'}),
          entity2: Entity.create({ name: 'test2'}),
          targetName1: 'to2',
          targetName2: 'to1',
      })
      assertType<string>(relation.entity1.name)
  })

    test('activity types', () => {


        assertType<TransferPublicType["source"]["type"] extends Klass<any>[] ? true: false>(true)
        assertType<number>({} as MapSource)
        assertType<TransferInstanceType["source"]>({} as InteractionInstanceType)
        assertType<KlassInstance<Klass<TransferPublicType>, false>["source"]>({} as InteractionInstanceType)
    })
})



