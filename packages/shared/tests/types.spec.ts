import {assertType, describe, test} from "vitest";
import {Entity, Relation} from "../entity/Entity";
import {
    KlassInstance,
    RequireWithoutDefault,
    Klass,
    UnwrapCollectionType,
    KlassMeta,
    KlassProp,
    InertKlassInstance, InertKlassInstanceProps, KlassInstancePrimitiveProps, RequiredProps
} from "../createClass";
import {
    ActivityGroup,
    ActivityGroupPublicType,
    Gateway, GatewayPublicType,
    Interaction, InteractionInstanceType,
    InteractionPublicType, TransferInstanceType, TransferPublicType,
    PayloadItem
} from "../activity/Activity";


assertType<(Klass<InteractionPublicType>| Klass<ActivityGroupPublicType>| Klass<GatewayPublicType>)[]>(
    [Interaction, ActivityGroup, Gateway]
)

type PayloadItem1 = typeof PayloadItem


// type Type1 = PayloadItem1["public"]['itemRef']['type'] extends Klass<any>[] ? true : never;
// type Type2 = PayloadItem1["public"]['itemRef']['type'][1] extends Klass<infer T2> ? T2 : never;
// type Type3 = TransferPublicType['source']['type'][2] extends Klass<infer T3> ? T3 : never;
// assertType<never>(true as unknown as  Type1)
// assertType<never>(true as unknown as  Type2)
// assertType<never>(true as unknown as  Type3)

const TrT = [Interaction, ActivityGroup, Gateway]
// type ShouldTrue = (typeof TrT) extends Klass<any>[] ? true: false
// type ShouldTrue = ([Klass<InteractionPublicType>, Klass<ActivityGroupPublicType>, Klass<GatewayPublicType>]) extends Klass<any>[] ? true: false
// type ShouldTrue = (TransferPublicType['source']['type']) extends Klass<any>[] ? true: false
type ShouldTrue = PayloadItem1["public"]['itemRef']['type'] extends Array<infer T> ?
    T extends Klass<any> ? true: never : never
assertType<never>(true as unknown as  ShouldTrue)

type MapSource = TransferPublicType['source']['type'] extends Klass<infer SUB_T>[] ?
    KlassProp<false, TransferPublicType['source']["collection"],InertKlassInstance<SUB_T>>: number

describe("createClass types", () => {
  test('relation types', () => {

      // assertType<RequireWithoutDefault<(typeof Relation.public)["entity1"],false>>(true)
      // assertType<RequireWithoutDefault<RelationPublicType["entity1"],false>>(true)

      const relation = Relation.create({
          entity1: Entity.create({ name: 'test'}),
          entity2: Entity.create({ name: 'test2'}),
          targetName1: 'to2',
          targetName2: 'to1',
      })
      assertType<KlassInstance<typeof Entity, false>>(relation.entity1)
      assertType<string>(relation.entity1.name)
  })

    test('activity types', () => {


        assertType<TransferPublicType["source"]["type"] extends Klass<any>[] ? true: false>(true)
        assertType<number>({} as MapSource)
        assertType<TransferInstanceType["source"]>({} as InteractionInstanceType)
        assertType<KlassInstance<Klass<TransferPublicType>, false>["source"]>({} as InteractionInstanceType)
    })
})



