import {assertType, describe, test} from "vitest";
import {Entity, Relation} from "../entity/Entity";
import {KlassInstance, RequireWithoutDefault, Klass, UnwrapCollectionType} from "../createClass";



type RelationKlassType = typeof Relation
type RelationInstanceType = KlassInstance<typeof Relation, false>
type RelationPublicType = RelationKlassType["public"]

describe("createClass types", () => {
  test('relation types', () => {

      // assertType<RequireWithoutDefault<(typeof Relation.public)["entity1"],false>>(true)
      assertType<RequireWithoutDefault<RelationPublicType["entity1"],false>>(true)

      const relation = Relation.create({
          entity1: Entity.create({ name: 'test'}),
          entity2: Entity.create({ name: 'test2'}),
          targetName1: 'to2',
          targetName2: 'to1',
      })
      assertType<KlassInstance<typeof Entity, false>>(relation.entity1)
      assertType<string>(relation.entity1.name)
  })
})


