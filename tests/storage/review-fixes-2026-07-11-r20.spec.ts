/**
 * r20 深度审查回归（storage 面）。
 *
 * F-1 —— `between` + `isReferenceValue` 的引用路径从不并入 JOIN 树：
 *   r19 F-2 为 EXIST 载荷补的引用收集、以及 r12 F-2 为外层 direct match 补的引用入树，
 *   都只识别 value[1] 为字符串的形态；between 的引用对（['a.b','c.d']）是同一声明面
 *   （isReferenceValue）的第三个漏网读者——SQL 引用了 "User_leader" 却没有对应 JOIN，
 *   直接抛 "missing FROM-clause entry"。修复：collectAtomReferencePaths 统一识别器
 *   （字符串 + between 引用对），direct match 与 EXIST 载荷两个消费方共用。
 *
 * F-2 —— 行内（in-row）link/combined 记录的 filtered 视图成员资格事件全family缺失：
 *   merged link 与 combined 记录的数据落在宿主行上，其 create/update/delete 事件由
 *   preprocessSameRowData / flashOut / DeletionExecutor 手工 push，从不经过
 *   handleRecordCreation / collectMembershipChecks / collectDeletionMemberships——
 *   以这些 link/combined 记录为 base 的 filtered relation / filtered entity 视图
 *   查询面正确、事件面零事件，下游对视图的响应式计算永久陈旧。r19 F-3 修了宿主侧
 *   filtered entity（combined 抢夺的旧 owner），link/combined 记录自身的视图是同一
 *   家族的平行漏网。修复：FilteredEntityManager 的 post-write 任务队列（create/update
 *   形态在物理写入后求值）+ 删除快照扩展（in-row link 随行消失前快照）。
 *
 * F-3 —— 关系端点经 generic update 静默重指且零事件：
 *   updateRelationByName 有「端点不可变」断言，generic update(relationName) 是同一契约
 *   的不设防入口——端点列被静默重写，旧 link 无 delete、新 link 无 create、连 update
 *   事件都没有；下游响应式计算与 ScopedSequence 的 scope 守卫（r18 F-4）全部失明。
 *   修复：UpdateExecutor.updateRecord 对 link 记录的端点变更 fail-fast（同 id 幂等引用
 *   放行——Transform 派生 relation 的 update patch 会原样携带端点）。
 *
 * F-4 —— flashOut 产生的 link create 事件缺 source/target 端点：
 *   与 preprocessSameRowData 的 link create 事件契约不一致，按端点模式匹配的下游
 *   （StateMachine trigger / Transform eventDeps）对该事件"查询可见、事件不可见"。
 *
 * I-1 —— IN/NOT IN 值数组含 null 的三值逻辑陷阱（r19 记录项治理）：
 *   `col IN (…, NULL)` 恒不匹配 NULL 行、`col NOT IN (…, NULL)` 静默过滤掉所有行。
 *   编译期拆分为显式 null 分支，与约束层（SchemaDialect.predicateSQLForOperator）对齐。
 */
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from "interaqt";
import { PGLiteDB, SQLiteDB } from "@drivers";
import { describe, expect, test } from "vitest";

describe("r20 F-1 — between + isReferenceValue hoists JOIN paths", () => {
  async function setupUsers() {
    const User = Entity.create({
      name: "User",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "age", type: "number" }),
        Property.create({ name: "salary", type: "number" }),
        Property.create({ name: "minSal", type: "number" }),
        Property.create({ name: "maxSal", type: "number" }),
      ],
    });
    const leader = Relation.create({
      source: User, sourceProperty: "leader", target: User, targetProperty: "members", type: "n:1",
    });
    const friends = Relation.create({
      source: User, sourceProperty: "friends", target: User, targetProperty: "friendOf", type: "n:n",
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User], [leader, friends], db);
    await setup.createTables();
    return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
  }

  test("direct match: salary between leader.minSal and leader.maxSal", async () => {
    const { db, handle } = await setupUsers();
    const boss = await handle.create("User", { name: "boss", minSal: 5, maxSal: 50 });
    await handle.create("User", { name: "inRange", salary: 10, leader: { id: boss.id } });
    await handle.create("User", { name: "outRange", salary: 100, leader: { id: boss.id } });

    const result = await handle.find(
      "User",
      MatchExp.atom({ key: "salary", value: ["between", ["leader.minSal", "leader.maxSal"]], isReferenceValue: true } as any),
      undefined,
      ["id", "name"]
    );
    expect(result.map((r: any) => r.name)).toEqual(["inRange"]);
    await db.close();
  });

  test("EXIST payload: friend.age between this.leader.minSal/maxSal", async () => {
    const { db, handle } = await setupUsers();
    const boss = await handle.create("User", { name: "boss", minSal: 20, maxSal: 40 });
    const lowBoss = await handle.create("User", { name: "lowBoss", minSal: 1, maxSal: 2 });
    const a = await handle.create("User", { name: "a", leader: { id: boss.id } });
    const b = await handle.create("User", { name: "b", leader: { id: lowBoss.id } });
    await handle.create("User", { name: "f30", age: 30, friendOf: [{ id: a.id }, { id: b.id }] });

    const result = await handle.find(
      "User",
      MatchExp.atom({
        key: "friends",
        value: ["exist", MatchExp.atom({ key: "age", value: ["between", ["leader.minSal", "leader.maxSal"]], isReferenceValue: true } as any)],
      }),
      undefined,
      ["id", "name"]
    );
    // a 的 leader 区间 [20,40] 含 30 → 命中；b 的 leader 区间 [1,2] 不含 → 排除。
    expect(result.map((r: any) => r.name)).toEqual(["a"]);
    await db.close();
  });
});

describe("r20 F-2 — in-row link/combined filtered view membership events", () => {
  function buildMergedFixture() {
    const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
    const Team = Entity.create({ name: "Team", properties: [Property.create({ name: "name", type: "string" })] });
    // n:1 → 默认合并策略把 link 合并进 source（User）行：in-row link
    const userTeam = Relation.create({
      name: "UserTeam",
      source: User, sourceProperty: "team", target: Team, targetProperty: "members", type: "n:1",
      properties: [Property.create({ name: "isPrimary", type: "boolean" })],
    });
    const PrimaryUserTeam = Relation.create({
      name: "PrimaryUserTeam",
      baseRelation: userTeam,
      sourceProperty: "primaryTeam",
      targetProperty: "primaryMembers",
      matchExpression: MatchExp.atom({ key: "isPrimary", value: ["=", true] }),
    });
    return { User, Team, userTeam, PrimaryUserTeam };
  }

  async function setupMerged() {
    const { User, Team, userTeam, PrimaryUserTeam } = buildMergedFixture();
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Team], [userTeam, PrimaryUserTeam], db);
    await setup.createTables();
    return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
  }

  test("merged in-row create via host ref emits filtered relation create", async () => {
    const { db, handle } = await setupMerged();
    const team = await handle.create("Team", { name: "T1" });
    const events: any[] = [];
    await handle.create("User", { name: "u1", team: { id: team.id, "&": { isPrimary: true } } }, events);

    expect((await handle.find("PrimaryUserTeam", undefined, undefined, ["*"])).length).toBe(1);
    const filteredCreates = events.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "create");
    expect(filteredCreates.length).toBe(1);
    // 事件 payload 与 base link create 同源（含 link id）
    expect(filteredCreates[0].record?.id).toBeDefined();
    await db.close();
  });

  test("merged in-row create NOT matching the predicate emits no filtered event", async () => {
    const { db, handle } = await setupMerged();
    const team = await handle.create("Team", { name: "T1" });
    const events: any[] = [];
    await handle.create("User", { name: "u1", team: { id: team.id, "&": { isPrimary: false } } }, events);
    expect(events.filter((e) => e.recordName === "PrimaryUserTeam").length).toBe(0);
    await db.close();
  });

  test("same-id in-place '&' flip emits filtered relation membership delete/create", async () => {
    const { db, handle } = await setupMerged();
    const team = await handle.create("Team", { name: "T1" });
    const u = await handle.create("User", { name: "u1", team: { id: team.id, "&": { isPrimary: true } } });

    // exit：isPrimary true → false
    const exitEvents: any[] = [];
    await handle.update("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), { team: { id: team.id, "&": { isPrimary: false } } }, exitEvents);
    expect((await handle.find("PrimaryUserTeam", undefined, undefined, ["*"])).length).toBe(0);
    expect(exitEvents.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "delete").length).toBe(1);

    // enter：false → true
    const enterEvents: any[] = [];
    await handle.update("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), { team: { id: team.id, "&": { isPrimary: true } } }, enterEvents);
    expect((await handle.find("PrimaryUserTeam", undefined, undefined, ["*"])).length).toBe(1);
    expect(enterEvents.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "create").length).toBe(1);
    await db.close();
  });

  test("merged replace via host update emits filtered delete (old link) + create (new link)", async () => {
    const { db, handle } = await setupMerged();
    const t1 = await handle.create("Team", { name: "T1" });
    const t2 = await handle.create("Team", { name: "T2" });
    const u = await handle.create("User", { name: "u1", team: { id: t1.id, "&": { isPrimary: true } } });

    const events: any[] = [];
    await handle.update("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), { team: { id: t2.id, "&": { isPrimary: true } } }, events);
    const filtered = events.filter((e) => e.recordName === "PrimaryUserTeam");
    expect(filtered.some((e) => e.type === "delete")).toBe(true);
    expect(filtered.some((e) => e.type === "create")).toBe(true);

    const links = await handle.find("PrimaryUserTeam", undefined, undefined, ["*", ["target", { attributeQuery: ["name"] }]]);
    expect(links.map((l: any) => l.target?.name)).toEqual(["T2"]);
    await db.close();
  });

  test("host deletion kills merged in-row link: filtered relation delete", async () => {
    const { db, handle } = await setupMerged();
    const team = await handle.create("Team", { name: "T1" });
    const u = await handle.create("User", { name: "u1", team: { id: team.id, "&": { isPrimary: true } } });

    const events: any[] = [];
    await handle.delete("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), events);
    expect(events.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "delete").length).toBe(1);
    await db.close();
  });

  function buildCombinedFixture() {
    const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
    const Profile = Entity.create({
      name: "Profile",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "verified", type: "boolean" }),
      ],
    });
    const userProfile = Relation.create({
      name: "UserProfile",
      source: User, sourceProperty: "profile", target: Profile, targetProperty: "owner", type: "1:1",
      properties: [Property.create({ name: "isActive", type: "boolean" })],
    });
    const ActiveUserProfile = Relation.create({
      name: "ActiveUserProfile",
      baseRelation: userProfile,
      sourceProperty: "activeProfile",
      targetProperty: "activeOwner",
      matchExpression: MatchExp.atom({ key: "isActive", value: ["=", true] }),
    });
    const VerifiedProfile = Entity.create({
      name: "VerifiedProfile",
      baseEntity: Profile,
      matchExpression: MatchExp.atom({ key: "verified", value: ["=", true] }),
    });
    return { User, Profile, userProfile, ActiveUserProfile, VerifiedProfile };
  }

  async function setupCombined() {
    const { User, Profile, userProfile, ActiveUserProfile, VerifiedProfile } = buildCombinedFixture();
    const db = new PGLiteDB();
    await db.open();
    // combined（三表合一）拓扑
    const setup = new DBSetup([User, Profile, VerifiedProfile], [userProfile, ActiveUserProfile], db, ["User.profile"]);
    await setup.createTables();
    return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
  }

  test("combined create via host emits filtered entity create for the combined record", async () => {
    const { db, handle } = await setupCombined();
    const events: any[] = [];
    await handle.create("User", { name: "u1", profile: { title: "p", verified: true, "&": { isActive: true } } }, events);

    expect(events.filter((e) => e.recordName === "VerifiedProfile" && e.type === "create").length).toBe(1);
    // combined link 的 filtered relation 视图 create
    expect(events.filter((e) => e.recordName === "ActiveUserProfile" && e.type === "create").length).toBe(1);
    await db.close();
  });

  test("combined nested value update via host emits filtered entity membership delete", async () => {
    const { db, handle } = await setupCombined();
    const u = await handle.create("User", { name: "u1", profile: { title: "p", verified: true } });
    const pid = (await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), undefined, ["id", ["profile", { attributeQuery: ["id"] }]])).profile.id;

    const events: any[] = [];
    await handle.update("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), { profile: { id: pid, verified: false } }, events);
    expect((await handle.find("VerifiedProfile", undefined, undefined, ["*"])).length).toBe(0);
    expect(events.filter((e) => e.recordName === "VerifiedProfile" && e.type === "delete").length).toBe(1);
    await db.close();
  });

  test("combined steal emits filtered relation delete (old link) + create (new link)", async () => {
    const { db, handle } = await setupCombined();
    const a = await handle.create("User", { name: "A", profile: { title: "p", "&": { isActive: true } } });
    const pid = (await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", a.id] }), undefined, ["id", ["profile", { attributeQuery: ["id"] }]])).profile.id;

    const events: any[] = [];
    await handle.create("User", { name: "B", profile: { id: pid, "&": { isActive: true } } }, events);

    const filtered = events.filter((e) => e.recordName === "ActiveUserProfile");
    expect(filtered.some((e) => e.type === "delete")).toBe(true);
    expect(filtered.some((e) => e.type === "create")).toBe(true);
    // 查询面与事件面一致
    const links = await handle.find("ActiveUserProfile", undefined, undefined, ["*", ["source", { attributeQuery: ["name"] }]]);
    expect(links.map((l: any) => l.source?.name)).toEqual(["B"]);
    await db.close();
  });

  test("removeRelation on combined link (relocate) emits filtered relation delete", async () => {
    const { db, handle } = await setupCombined();
    await handle.create("User", { name: "A", profile: { title: "p", "&": { isActive: true } } });
    const link = await handle.findOne("UserProfile", undefined, undefined, ["*"]);

    const events: any[] = [];
    await handle.removeRelationByName("UserProfile", MatchExp.atom({ key: "id", value: ["=", link.id] }), events);
    expect(events.filter((e) => e.recordName === "ActiveUserProfile" && e.type === "delete").length).toBe(1);
    await db.close();
  });

  test("host deletion kills combined link (endpoint survives): filtered relation delete", async () => {
    const { db, handle } = await setupCombined();
    const a = await handle.create("User", { name: "A", profile: { title: "p", "&": { isActive: true } } });

    const events: any[] = [];
    await handle.delete("User", MatchExp.atom({ key: "id", value: ["=", a.id] }), events);
    expect(events.filter((e) => e.recordName === "ActiveUserProfile" && e.type === "delete").length).toBe(1);
    await db.close();
  });

  test("control: direct link create / updateRelationByName still emit view events exactly once", async () => {
    const { db, handle } = await setupMerged();
    const team = await handle.create("Team", { name: "T1" });
    const u = await handle.create("User", { name: "u1" });

    const createEvents: any[] = [];
    await handle.addRelationByNameById("UserTeam", u.id, team.id, { isPrimary: true }, createEvents);
    expect(createEvents.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "create").length).toBe(1);

    const link = await handle.findOne("UserTeam", undefined, undefined, ["*"]);
    const updateEvents: any[] = [];
    await handle.updateRelationByName("UserTeam", MatchExp.atom({ key: "id", value: ["=", link.id] }), { isPrimary: false }, updateEvents);
    expect(updateEvents.filter((e) => e.recordName === "PrimaryUserTeam" && e.type === "delete").length).toBe(1);
    await db.close();
  });
});

describe("r20 F-3 — relation endpoint immutability through generic update", () => {
  async function setupRel() {
    const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
    const Project = Entity.create({ name: "Project", properties: [Property.create({ name: "name", type: "string" })] });
    const userProject = Relation.create({
      name: "UserProject",
      source: User, sourceProperty: "project", target: Project, targetProperty: "users", type: "n:1",
      properties: [Property.create({ name: "role", type: "string" })],
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Project], [userProject], db);
    await setup.createTables();
    return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
  }

  test("changing an endpoint via update(relationName) fails fast; data untouched", async () => {
    const { db, handle } = await setupRel();
    const p1 = await handle.create("Project", { name: "P1" });
    const p2 = await handle.create("Project", { name: "P2" });
    const u = await handle.create("User", { name: "u", project: { id: p1.id } });
    const link = await handle.findOne("UserProject", undefined, undefined, ["*"]);

    await expect(
      handle.update("UserProject", MatchExp.atom({ key: "id", value: ["=", link.id] }), { target: { id: p2.id } })
    ).rejects.toThrow(/cannot change target of relation record/);

    // 数据面未被触碰
    const after = await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", u.id] }), undefined, ["id", ["project", { attributeQuery: ["name"] }]]);
    expect(after.project.name).toBe("P1");
    await db.close();
  });

  test("same-id endpoint reference (idempotent) plus property update stays legal", async () => {
    const { db, handle } = await setupRel();
    const p1 = await handle.create("Project", { name: "P1" });
    await handle.create("User", { name: "u", project: { id: p1.id } });
    const link = await handle.findOne("UserProject", undefined, undefined, ["*", ["source", { attributeQuery: ["id"] }]]);

    await handle.update("UserProject", MatchExp.atom({ key: "id", value: ["=", link.id] }), { source: { id: link.source.id }, role: "admin" });
    const after = await handle.findOne("UserProject", MatchExp.atom({ key: "id", value: ["=", link.id] }), undefined, ["*"]);
    expect(after.role).toBe("admin");
    await db.close();
  });
});

describe("r20 F-4 — flashOut link create event carries endpoints", () => {
  test("combined steal link create event has source/target ids", async () => {
    const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
    const Profile = Entity.create({ name: "Profile", properties: [Property.create({ name: "title", type: "string" })] });
    const userProfile = Relation.create({
      name: "UserProfile",
      source: User, sourceProperty: "profile", target: Profile, targetProperty: "owner", type: "1:1",
    });
    const db = new PGLiteDB();
    await db.open();
    const setup = new DBSetup([User, Profile], [userProfile], db, ["User.profile"]);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

    const a = await handle.create("User", { name: "A", profile: { title: "p" } });
    const pid = (await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", a.id] }), undefined, ["id", ["profile", { attributeQuery: ["id"] }]])).profile.id;

    const events: any[] = [];
    const b = await handle.create("User", { name: "B", profile: { id: pid } }, events);
    const linkCreate = events.find((e) => e.type === "create" && e.recordName === "UserProfile");
    expect(linkCreate?.record?.source?.id).toBe(b.id);
    expect(linkCreate?.record?.target?.id).toBe(pid);
    // 抢夺路径的 update 面同样携带端点
    const c = await handle.create("User", { name: "C" });
    const updateEvents: any[] = [];
    await handle.update("User", MatchExp.atom({ key: "id", value: ["=", c.id] }), { profile: { id: pid } }, updateEvents);
    const stealLinkCreate = updateEvents.find((e) => e.type === "create" && e.recordName === "UserProfile");
    expect(stealLinkCreate?.record?.source?.id).toBe(c.id);
    expect(stealLinkCreate?.record?.target?.id).toBe(pid);
    await db.close();
  });
});

describe("r20 I-1 — IN/NOT IN with null values (three-valued logic)", () => {
  async function setupItems(db: PGLiteDB | SQLiteDB) {
    const Item = Entity.create({
      name: "Item",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "category", type: "string" }),
      ],
    });
    await db.open();
    const setup = new DBSetup([Item], [], db);
    await setup.createTables();
    const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
    await handle.create("Item", { name: "a", category: "x" });
    await handle.create("Item", { name: "b", category: "y" });
    await handle.create("Item", { name: "c" }); // category IS NULL
    return handle;
  }

  for (const [label, makeDb] of [["PGLite", () => new PGLiteDB()], ["SQLite", () => new SQLiteDB()]] as const) {
    test(`[${label}] IN with null matches NULL rows plus listed values`, async () => {
      const db = makeDb();
      const handle = await setupItems(db);
      const result = await handle.find("Item", MatchExp.atom({ key: "category", value: ["in", ["x", null]] }), undefined, ["name"]);
      expect(result.map((r: any) => r.name).sort()).toEqual(["a", "c"]);

      // 纯 null 列表 → 等价 IS NULL
      const onlyNull = await handle.find("Item", MatchExp.atom({ key: "category", value: ["in", [null]] }), undefined, ["name"]);
      expect(onlyNull.map((r: any) => r.name)).toEqual(["c"]);
      await db.close();
    });

    test(`[${label}] NOT IN with null excludes NULL rows and listed values`, async () => {
      const db = makeDb();
      const handle = await setupItems(db);
      // 修复前：NOT IN (…, NULL) 对任意行 UNKNOWN → 静默零行
      const result = await handle.find("Item", MatchExp.atom({ key: "category", value: ["not in", ["x", null]] }), undefined, ["name"]);
      expect(result.map((r: any) => r.name)).toEqual(["b"]);

      const onlyNull = await handle.find("Item", MatchExp.atom({ key: "category", value: ["not in", [null]] }), undefined, ["name"]);
      expect(onlyNull.map((r: any) => r.name).sort()).toEqual(["a", "b"]);
      await db.close();
    });

    test(`[${label}] IN/NOT IN without null keep existing semantics (NULL rows never match)`, async () => {
      const db = makeDb();
      const handle = await setupItems(db);
      const inResult = await handle.find("Item", MatchExp.atom({ key: "category", value: ["in", ["x", "y"]] }), undefined, ["name"]);
      expect(inResult.map((r: any) => r.name).sort()).toEqual(["a", "b"]);
      // SQL 语义：NOT IN 不匹配 NULL 行（未显式声明 null 时保持原生三值逻辑）
      const notInResult = await handle.find("Item", MatchExp.atom({ key: "category", value: ["not in", ["x"]] }), undefined, ["name"]);
      expect(notInResult.map((r: any) => r.name)).toEqual(["b"]);
      await db.close();
    });
  }
});
