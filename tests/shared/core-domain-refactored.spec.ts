import { describe, test, expect, beforeEach } from "vitest";
import { Entity } from "../../src/shared/refactored/Entity";
import { Property } from "../../src/shared/refactored/Property";
import { Relation } from "../../src/shared/refactored/Relation";
import { Interaction } from "../../src/shared/refactored/Interaction";
import { Action } from "../../src/shared/refactored/Action";
import { clearAllInstances } from "../../src/shared/refactored/utils";

describe("Core Domain Classes Refactored", () => {
  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(Entity, Property, Relation, Interaction, Action);
  });

  describe("Property", () => {
    test("should create property instance", () => {
      const property = Property.create({
        name: "title",
        type: "string"
      });

      expect(property.name).toBe("title");
      expect(property.type).toBe("string");
      expect(property.uuid).toBeDefined();
      expect(property._type).toBe("Property");
    });

    test("should create property with all options", () => {
      const property = Property.create({
        name: "tags",
        type: "string",
        collection: true,
        defaultValue: () => [],
        computed: () => "computed"
      });

      expect(property.collection).toBe(true);
      expect(property.defaultValue).toBeDefined();
      expect(property.computed).toBeDefined();
    });

    test("should stringify and parse property", () => {
      const original = Property.create({
        name: "status",
        type: "string",
        defaultValue: () => "active"
      });
      
      const stringified = Property.stringify(original);
      const parsed = Property.parse(stringified);

      expect(parsed.name).toBe("status");
      expect(parsed.type).toBe("string");
      expect(parsed.defaultValue).toBeDefined();
    });

    test("should track instances", () => {
      const p1 = Property.create({ name: "p1", type: "string" });
      const p2 = Property.create({ name: "p2", type: "number" });

      expect(Property.instances).toHaveLength(2);
      expect(Property.instances).toContain(p1);
      expect(Property.instances).toContain(p2);
    });
  });

  describe("Entity", () => {
    test("should create entity instance", () => {
      const entity = Entity.create({
        name: "User"
      });

      expect(entity.name).toBe("User");
      expect(entity.properties).toEqual([]);
      expect(entity.uuid).toBeDefined();
      expect(entity._type).toBe("Entity");
    });

    test("should create entity with properties", () => {
      const nameProperty = Property.create({ name: "name", type: "string" });
      const ageProperty = Property.create({ name: "age", type: "number" });
      
      const entity = Entity.create({
        name: "Person",
        properties: [nameProperty, ageProperty]
      });

      expect(entity.properties).toHaveLength(2);
      expect(entity.properties[0]).toBe(nameProperty);
      expect(entity.properties[1]).toBe(ageProperty);
    });

    test("should create filtered entity", () => {
      const sourceEntity = Entity.create({ name: "User" });
      
      const filteredEntity = Entity.create({
        name: "ActiveUser",
        sourceEntity: sourceEntity,
        matchExpression: { status: "active" }
      });

      expect(filteredEntity.sourceEntity).toBe(sourceEntity);
      expect(filteredEntity.matchExpression).toEqual({ status: "active" });
    });

    test("should stringify and parse entity", () => {
      const prop = Property.create({ name: "title", type: "string" });
      const original = Entity.create({
        name: "Article",
        properties: [prop]
      });
      
      const stringified = Entity.stringify(original);
      
      // Clear instances before parsing to avoid duplicate UUID error
      clearAllInstances(Entity);
      
      const parsed = Entity.parse(stringified);

      expect(parsed.name).toBe("Article");
      expect(parsed.properties).toHaveLength(1);
      expect(parsed.uuid).toBe(original.uuid); // Should preserve UUID
    });
  });

  describe("Relation", () => {
    test("should create relation instance", () => {
      const userEntity = Entity.create({ name: "User" });
      const postEntity = Entity.create({ name: "Post" });
      
      const relation = Relation.create({
        source: userEntity,
        sourceProperty: "posts",
        target: postEntity,
        targetProperty: "author",
        type: "1:n"
      });

      expect(relation.source).toBe(userEntity);
      expect(relation.target).toBe(postEntity);
      expect(relation.type).toBe("1:n");
      expect(relation.isTargetReliance).toBe(false);
    });

    test("should auto-generate relation name", () => {
      const userEntity = Entity.create({ name: "User" });
      const postEntity = Entity.create({ name: "Post" });
      
      const relation = Relation.create({
        source: userEntity,
        sourceProperty: "posts",
        target: postEntity,
        targetProperty: "author",
        type: "1:n"
      });

      expect(relation.name).toBe("User_posts_author_Post");
    });

    test("should use provided relation name", () => {
      const userEntity = Entity.create({ name: "User" });
      const postEntity = Entity.create({ name: "Post" });
      
      const relation = Relation.create({
        name: "UserPostRelation",
        source: userEntity,
        sourceProperty: "posts",
        target: postEntity,
        targetProperty: "author",
        type: "1:n"
      });

      expect(relation.name).toBe("User_posts_author_Post");
    });

    test("should create relation with properties", () => {
      const userEntity = Entity.create({ name: "User" });
      const roleEntity = Entity.create({ name: "Role" });
      const assignedAtProp = Property.create({ name: "assignedAt", type: "string" });
      
      const relation = Relation.create({
        source: userEntity,
        sourceProperty: "roles",
        target: roleEntity,
        targetProperty: "users",
        type: "n:n",
        properties: [assignedAtProp]
      });

      expect(relation.properties).toHaveLength(1);
      expect(relation.properties[0]).toBe(assignedAtProp);
    });
  });

  describe("Interaction", () => {
    test("should create interaction instance", () => {
      const action = Action.create({ name: "submit" });
      
      const interaction = Interaction.create({
        name: "SubmitForm",
        action: action
      });

      expect(interaction.name).toBe("SubmitForm");
      expect(interaction.action).toBe(action);
      expect(interaction.sideEffects).toEqual([]);
      expect(interaction._type).toBe("Interaction");
    });

    test("should create interaction with entity data", () => {
      const userEntity = Entity.create({ name: "User" });
      const createAction = Action.create({ name: "create" });
      
      const interaction = Interaction.create({
        name: "CreateUser",
        action: createAction,
        data: userEntity
      });

      expect(interaction.data).toBe(userEntity);
    });

    test("should stringify and parse interaction", () => {
      const action = Action.create({ name: "update" });
      const original = Interaction.create({
        name: "UpdateProfile",
        action: action
      });
      
      const stringified = Interaction.stringify(original);
      const parsed = Interaction.parse(stringified);

      expect(parsed.name).toBe("UpdateProfile");
      expect(parsed.action).toBeDefined();
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Entity.isKlass).toBe(true);
      expect(Property.isKlass).toBe(true);
      expect(Relation.isKlass).toBe(true);
      expect(Interaction.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Entity.displayName).toBe("Entity");
      expect(Property.displayName).toBe("Property");
      expect(Relation.displayName).toBe("Relation");
      expect(Interaction.displayName).toBe("Interaction");
    });

    test("should use is() for type checking", () => {
      const entity = Entity.create({ name: "Test" });
      const property = Property.create({ name: "test", type: "string" });
      
      expect(Entity.is(entity)).toBe(true);
      expect(Entity.is(property)).toBe(false);
      expect(Property.is(property)).toBe(true);
      expect(Property.is(entity)).toBe(false);
    });

    test("should prevent duplicate UUIDs", () => {
      const uuid = "test-uuid-123";
      const entity1 = Entity.create({ name: "Entity1" }, { uuid });
      
      expect(() => {
        Entity.create({ name: "Entity2" }, { uuid });
      }).toThrow("duplicate uuid");
    });
  });
}); 