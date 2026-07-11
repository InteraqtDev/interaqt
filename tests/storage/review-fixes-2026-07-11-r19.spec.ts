import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from "interaqt";
import { PGLiteDB } from "@drivers";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * r19 F-2 regression.
 *
 * An EXIST subquery whose inner condition uses `isReferenceValue` to compare against an
 * outer x:1 path (e.g. THIS user's `leader.salary`) resolves the reference against the
 * outer root scope, but the outer query never JOINed that path — the generated SQL
 * referenced `User_leader` with no matching FROM entry ("missing FROM-clause entry for
 * table"). r12 F-2 fixed the outer *direct* match reference; the EXIST payload was the
 * un-hoisted sibling. Fixed by hoisting inner exist reference paths into the outer JOIN tree.
 */
describe("r19 F-2 — EXIST inner isReferenceValue hoists outer x:1 JOIN", () => {
  let db: PGLiteDB;
  let handle: EntityQueryHandle;

  beforeEach(async () => {
    const User = Entity.create({
      name: "User",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "salary", type: "number" }),
        Property.create({ name: "age", type: "number" }),
      ],
    });
    const leader = Relation.create({
      source: User,
      sourceProperty: "leader",
      target: User,
      targetProperty: "members",
      type: "n:1",
    });
    const friends = Relation.create({
      source: User,
      sourceProperty: "friends",
      target: User,
      targetProperty: "friendOf",
      type: "n:n",
    });

    db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User], [leader, friends], db);
    await setup.createTables();
    handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
  });

  afterEach(async () => {
    await db.close();
  });

  test("exist over friends comparing friend.age < this.leader.salary executes and filters correctly", async () => {
    const boss = await handle.create("User", { name: "boss", salary: 100, age: 50 });
    const lowBoss = await handle.create("User", { name: "lowBoss", salary: 5, age: 45 });
    // a: leader=boss(salary 100); friend youngFriend age 30 < 100 → matches
    const a = await handle.create("User", { name: "a", salary: 10, age: 30, leader: { id: boss.id } });
    // b: leader=lowBoss(salary 5); friend age 30 is NOT < 5 → does not match
    const b = await handle.create("User", { name: "b", salary: 10, age: 20, leader: { id: lowBoss.id } });
    const youngFriend = await handle.create("User", {
      name: "yf",
      salary: 1,
      age: 30,
      friendOf: [{ id: a.id }, { id: b.id }],
    });

    const result = await handle.find(
      "User",
      MatchExp.atom({
        key: "friends",
        value: [
          "exist",
          MatchExp.atom({ key: "age", value: ["<", "leader.salary"], isReferenceValue: true }),
        ],
      }),
      undefined,
      ["id", "name"]
    );

    const names = result.map((r) => r.name).sort();
    // a has a friend (yf, age 30) younger than a's leader salary (100) → matches.
    // b's leader salary is 5, yf age 30 is not < 5 → b excluded.
    expect(names).toEqual(["a"]);
  });
});
