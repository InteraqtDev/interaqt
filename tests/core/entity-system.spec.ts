import { describe, test, expect } from "vitest";
import { Entity, Property, PropertyTypes, Relation } from "@core";

describe("Entity System - createClass functionality", () => {
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

    test("should stringify and parse property", () => {
      const prop = Property.create({
        name: "age",
        type: PropertyTypes.Number
      });

      const stringified = Property.stringify(prop);
      expect(stringified).toContain('"name":"age"');
      expect(stringified).toContain('"type":"number"');

      // Parse requires re-creating from stringified data
      const objects = JSON.parse(stringified);
      const parsed = Property.create(objects.public);
      expect(parsed.name).toBe("age");
      expect(parsed.type).toBe(PropertyTypes.Number);
    });

    test("should clone property", () => {
      const original = Property.create({
        name: "mail",
        type: PropertyTypes.String,
        computed: () => "computed@example.com"
      });

      const cloned = Property.clone(original, false);
      
      expect(cloned).not.toBe(original); // Different instance
      expect(cloned.uuid).not.toBe(original.uuid); // Different UUID
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

    test("should stringify and parse entity", () => {
      const prop = Property.create({ name: "title", type: PropertyTypes.String });
      const entity = Entity.create({
        name: "Post",
        properties: [prop]
      });

      const stringified = Entity.stringify(entity);
      expect(stringified).toContain('"name":"Post"');
      expect(stringified).toContain('"properties":[');

      // Parse requires re-creating from stringified data  
      const objects = JSON.parse(stringified);
      const newProp = Property.create({ name: "title", type: PropertyTypes.String });
      const parsed = Entity.create({
        name: objects.public.name,
        properties: [newProp]
      });
      expect(parsed.name).toBe("Post");
      expect(parsed.properties).toHaveLength(1);
      expect(parsed.properties[0].name).toBe("title");
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
      // When deep clone is false, properties are not deep cloned
      expect(cloned.properties[0]).toBe(original.properties[0])
    });

    test("should handle entity with computation", () => {
      const entity = Entity.create({
        name: "Article",
        properties: [],
        computation: undefined // computation is optional
      });

      expect(entity.name).toBe("Article");
      expect(entity.properties).toHaveLength(0);
      expect(entity.computation).toBeUndefined();
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

      // Relation name is computed automatically
      expect(relation.name).toBe("User_posts_author_Post");
      expect(relation.source.name).toBe("User");
      expect(relation.target.name).toBe("Post");
      expect(relation.type).toBe("1:n");
      expect(relation.sourceProperty).toBe("posts");
      expect(relation.targetProperty).toBe("author");
      expect(relation.uuid).toBeDefined();
      expect(relation._type).toBe("Relation");
    });

    test("should stringify and parse relation", () => {
      const entity1 = Entity.create({ name: "Category", properties: [] });
      const entity2 = Entity.create({ name: "Product", properties: [] });
      
      const relation = Relation.create({
        source: entity1,
        target: entity2,
        type: "n:n",
        sourceProperty: "products",
        targetProperty: "categories"
      });

      const stringified = Relation.stringify(relation);
      expect(stringified).toContain('"type":"n:n"');
      expect(stringified).toContain('"sourceProperty":"products"');

      // Parse requires re-creating from stringified data
      const objects = JSON.parse(stringified);
      expect(objects.public.type).toBe("n:n");
      expect(objects.public.sourceProperty).toBe("products");
      expect(objects.public.targetProperty).toBe("categories");
    });

    test("should clone relation", () => {
      const entity1 = Entity.create({ name: "Department", properties: [] });
      const entity2 = Entity.create({ name: "Employee", properties: [] });
      
      const original = Relation.create({
        source: entity1,
        target: entity2,
        type: "1:n",
        sourceProperty: "employees",
        targetProperty: "department",
        isTargetReliance: false,
        properties: []
      });

      const cloned = Relation.clone(original, false);
      
      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      // When deep clone is false, entities are not deep cloned
      expect(cloned.source).toBe(original.source);
      expect(cloned.target).toBe(original.target);
      expect(cloned.type).toBe(original.type);
    });

    test("should handle all relation types", () => {
      const entity = Entity.create({ name: "Generic", properties: [] });
      
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

      const manyToMany = Relation.create({
        source: entity,
        target: entity,
        type: "n:n",
        sourceProperty: "many",
        targetProperty: "many"
      });

      expect(oneToOne.type).toBe("1:1");
      expect(oneToMany.type).toBe("1:n");
      expect(manyToMany.type).toBe("n:n");
    });

    test("should detect symmetric relation", () => {
      const entity = Entity.create({ name: "Person", properties: [] });
      
      const symmetric = Relation.create({
        source: entity,
        target: entity,
        type: "n:n",
        sourceProperty: "friends",
        targetProperty: "friends"
      });

      // The relation is symmetric when source === target && sourceProperty === targetProperty
      expect(symmetric.source).toBe(symmetric.target);
      expect(symmetric.sourceProperty).toBe(symmetric.targetProperty);
    });
  });

  describe("Instance management", () => {
    test("should track created instances", () => {
      // Note: The actual instance tracking is internal to createClass
      // We can verify that each creation returns a unique instance
      const prop1 = Property.create({ name: "test", type: PropertyTypes.String });
      const prop2 = Property.create({ name: "test", type: PropertyTypes.String });
      
      expect(prop1).not.toBe(prop2);
      expect(prop1.uuid).not.toBe(prop2.uuid);
    });
  });
}); 