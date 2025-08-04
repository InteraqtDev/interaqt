import { describe, test, expect, beforeEach } from "vitest";
import { 
  Property, PropertyTypes, Entity, Relation,
  clearAllInstances
} from "../../src/shared/refactored";

describe("Entity System Refactored - compatibility test", () => {
  beforeEach(() => {
    // Clear all instances
    clearAllInstances(Property, Entity, Relation);
  });

  describe("Property", () => {
    test("should create property instance", () => {
      const prop = Property.create({
        name: "user",
        type: PropertyTypes.String,
        defaultValue: () => "guest"
      });

      expect(prop.name).toBe("user");
      expect(prop.type).toBe(PropertyTypes.String);
      expect(prop.defaultValue).toBeDefined();
      expect(prop.uuid).toBeDefined();
      expect(prop._type).toBe("Property");
    });

    test("should create property with all options", () => {
      const prop = Property.create({
        name: "count",
        type: PropertyTypes.Number,
        collection: true,
        defaultValue: () => 0,
        computed: () => 42,
        // computation: { type: "Count" } // TODO: create real Count instance
      });

      expect(prop.name).toBe("count");
      expect(prop.type).toBe(PropertyTypes.Number);
      expect(prop.collection).toBe(true);
      expect(prop.defaultValue).toBeDefined();
      expect(prop.computed).toBeDefined();
      // expect(prop.computation).toEqual({ type: "Count" });
    });

    test("should stringify and parse property", () => {
      const prop = Property.create({
        name: "age",
        type: PropertyTypes.Number
      });

      const stringified = Property.stringify(prop);
      const parsed = Property.parse(stringified);

      expect(parsed.name).toBe("age");
      expect(parsed.type).toBe(PropertyTypes.Number);
      expect(parsed._type).toBe("Property");
    });

    test("should clone property", () => {
      const original = Property.create({
        name: "mail",
        type: PropertyTypes.String,
        computed: () => "computed@example.com"
      });

      const cloned = Property.clone(original, false);
      
      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.type).toBe(original.type);
      expect(cloned.computed).toBeDefined();
    });

    test("should handle all property types", () => {
      const stringProp = Property.create({ name: "str", type: PropertyTypes.String });
      const numberProp = Property.create({ name: "num", type: PropertyTypes.Number });
      const boolProp = Property.create({ name: "bool", type: PropertyTypes.Boolean });

      expect(stringProp.type).toBe("string");
      expect(numberProp.type).toBe("number");
      expect(boolProp.type).toBe("boolean");
    });
  });

  describe("Entity", () => {
    test("should create entity instance", () => {
      const userProp = Property.create({ name: "user", type: PropertyTypes.String });
      const emailProp = Property.create({ name: "mail", type: PropertyTypes.String });

      const entity = Entity.create({
        name: "User",
        properties: [userProp, emailProp]
      });

      expect(entity.name).toBe("User");
      expect(entity.properties).toHaveLength(2);
      expect(entity.properties[0].name).toBe("user");
      expect(entity.properties[1].name).toBe("mail");
      expect(entity.uuid).toBeDefined();
      expect(entity._type).toBe("Entity");
    });

    test("should create entity with default properties", () => {
      const entity = Entity.create({
        name: "Empty"
      });

      expect(entity.name).toBe("Empty");
      expect(entity.properties).toEqual([]);
    });

    test("should create filtered entity", () => {
      const sourceEntity = Entity.create({ name: "User" });
      
      const filteredEntity = Entity.create({
        name: "ActiveUser",
        baseEntity: sourceEntity,
        matchExpression: { status: "active" }
      });

      expect(filteredEntity.name).toBe("ActiveUser");
      expect(filteredEntity.baseEntity).toBe(sourceEntity);
      expect(filteredEntity.matchExpression).toEqual({ status: "active" });
    });

    test("should stringify and parse entity", () => {
      const prop = Property.create({ name: "title", type: PropertyTypes.String });
      const entity = Entity.create({
        name: "Post",
        properties: [prop]
      });

      const stringified = Entity.stringify(entity);
      
      // Clear instances before parsing to avoid duplicate UUID error
      clearAllInstances(Entity);
      
      const parsed = Entity.parse(stringified);

      expect(parsed.name).toBe("Post");
      expect(parsed._type).toBe("Entity");
      expect(parsed.uuid).toBe(entity.uuid); // Should preserve UUID
      // Note: properties won't be deeply parsed
    });

    test("should clone entity", () => {
      const prop = Property.create({ name: "id", type: PropertyTypes.Number });
      const original = Entity.create({
        name: "Product",
        properties: [prop]
      });

      const cloned = Entity.clone(original, false);
      
      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.properties).toHaveLength(1);
      expect(cloned.properties[0]).toBe(original.properties[0]); // shallow clone
    });
  });

  describe("Relation", () => {
    test("should create relation instance", () => {
      const userEntity = Entity.create({ name: "User", properties: [] });
      const postEntity = Entity.create({ name: "Post", properties: [] });

      const relation = Relation.create({
        source: userEntity,
        target: postEntity,
        type: "1:n",
        sourceProperty: "posts",
        targetProperty: "author"
      });

      expect(relation.name).toBe("User_posts_author_Post");
      expect(relation.source).toBe(userEntity);
      expect(relation.target).toBe(postEntity);
      expect(relation.type).toBe("1:n");
      expect(relation.sourceProperty).toBe("posts");
      expect(relation.targetProperty).toBe("author");
      expect(relation.isTargetReliance).toBe(false);
      expect(relation._type).toBe("Relation");
    });

    test("should create relation with explicit name", () => {
      const entity1 = Entity.create({ name: "A" });
      const entity2 = Entity.create({ name: "B" });

      const relation = Relation.create({
        name: "CustomRelation",
        source: entity1,
        target: entity2,
        type: "n:n",
        sourceProperty: "bs",
        targetProperty: "as"
      });

      expect(relation.name).toBe("CustomRelation");
    });

    test("should create relation with properties", () => {
      const entity = Entity.create({ name: "Node" });
      const prop = Property.create({ name: "weight", type: PropertyTypes.Number });

      const relation = Relation.create({
        source: entity,
        target: entity,
        type: "n:n",
        sourceProperty: "connections",
        targetProperty: "connections",
        properties: [prop]
      });

      expect(relation.properties).toHaveLength(1);
      expect(relation.properties[0].name).toBe("weight");
    });

    test("should stringify and parse relation", () => {
      const entity1 = Entity.create({ name: "Category" });
      const entity2 = Entity.create({ name: "Product" });
      
      const relation = Relation.create({
        source: entity1,
        target: entity2,
        type: "n:n",
        sourceProperty: "products",
        targetProperty: "categories"
      });

      const stringified = Relation.stringify(relation);
      const parsed = Relation.parse(stringified);

      expect(parsed.type).toBe("n:n");
      expect(parsed.sourceProperty).toBe("products");
      expect(parsed.targetProperty).toBe("categories");
      expect(parsed._type).toBe("Relation");
    });

    test("should handle all relation types", () => {
      const entity = Entity.create({ name: "Generic" });
      
      const oneToOne = Relation.create({
        source: entity,
        target: entity,
        type: "1:1",
        sourceProperty: "one",
        targetProperty: "one"
      });

      const oneToMany = Relation.create({
        source: entity,
        target: entity,
        type: "1:n",
        sourceProperty: "many",
        targetProperty: "one"
      });

      const manyToOne = Relation.create({
        source: entity,
        target: entity,
        type: "n:1",
        sourceProperty: "one",
        targetProperty: "many"
      });

      const manyToMany = Relation.create({
        source: entity,
        target: entity,
        type: "n:n",
        sourceProperty: "many",
        targetProperty: "many"
      });

      expect(oneToOne.type).toBe("1:1");
      expect(oneToMany.type).toBe("1:n");
      expect(manyToOne.type).toBe("n:1");
      expect(manyToMany.type).toBe("n:n");
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Property.isKlass).toBe(true);
      expect(Entity.isKlass).toBe(true);
      expect(Relation.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Property.displayName).toBe("Property");
      expect(Entity.displayName).toBe("Entity");
      expect(Relation.displayName).toBe("Relation");
    });

    test("should track instances", () => {
      const p1 = Property.create({ name: "p1", type: PropertyTypes.String });
      const p2 = Property.create({ name: "p2", type: PropertyTypes.Number });
      const e1 = Entity.create({ name: "E1", properties: [p1] });
      const e2 = Entity.create({ name: "E2", properties: [p2] });
      const r1 = Relation.create({
        source: e1,
        target: e2,
        type: "1:1",
        sourceProperty: "e2",
        targetProperty: "e1"
      });

      expect(Property.instances).toHaveLength(2);
      expect(Entity.instances).toHaveLength(2);
      expect(Relation.instances).toHaveLength(1);
    });
  });
}); 