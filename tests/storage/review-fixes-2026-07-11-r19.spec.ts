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

/**
 * r19 F-3 regression.
 *
 * In the combined (three-table-merged) topology, stealing a merged endpoint from an old
 * owner physically flashes the columns out of the old owner's row but never re-evaluated
 * the old owner's filtered-entity membership — the old owner silently exits the filtered
 * view (query side correct) with NO membership delete event (event side missing), leaving
 * downstream reactive computations over that view permanently stale. The merged topology
 * already routes the old owner through the membership machinery; combined flashOut was the
 * parallel gap (r18 retrospective flagged combined × filtered as a matrix blank).
 */
describe("r19 F-3 — combined steal emits old owner's filtered membership delete event", () => {
  test("stealing a combined profile emits UserWithProfile delete for the old owner", async () => {
    const User = Entity.create({
      name: "User",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Profile = Entity.create({
      name: "Profile",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const userProfile = Relation.create({
      source: User,
      sourceProperty: "profile",
      target: Profile,
      targetProperty: "owner",
      type: "1:1",
    });
    const UserWithProfile = Entity.create({
      name: "UserWithProfile",
      baseEntity: User,
      matchExpression: MatchExp.atom({ key: "profile.id", value: ["not", null] }),
    });

    const db = new PGLiteDB();
    await db.open();
    // combined topology: merge the profile link into the shared row.
    const setup = new DBSetup([User, Profile, UserWithProfile], [userProfile], db, ["User.profile"]);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const a = await handle.create("User", { name: "A", profile: { title: "p" } });
    expect((await handle.find("UserWithProfile", undefined, undefined, ["name"])).map((m) => m.name)).toEqual(["A"]);

    const pid = (
      await handle.findOne(
        "User",
        MatchExp.atom({ key: "id", value: ["=", a.id] }),
        undefined,
        ["id", ["profile", { attributeQuery: ["id"] }]]
      )
    ).profile.id;

    // Steal p onto a new user B → A loses its profile → A exits UserWithProfile.
    const events: any[] = [];
    await handle.create("User", { name: "B", profile: { id: pid } }, events);

    const membersAfter = (await handle.find("UserWithProfile", undefined, undefined, ["name"])).map((m) => m.name);
    // Query side: A gone, B present.
    expect(membersAfter).toEqual(["B"]);

    const filteredEvents = events.filter((e) => e.recordName === "UserWithProfile");
    // Event side: a delete for A must be emitted (the fix), plus a create for B.
    expect(filteredEvents.some((e) => e.type === "delete" && e.record?.id === a.id)).toBe(true);
    expect(filteredEvents.some((e) => e.type === "create")).toBe(true);

    await db.close();
  });
});
