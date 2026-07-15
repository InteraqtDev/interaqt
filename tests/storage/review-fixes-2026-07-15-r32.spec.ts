/**
 * r32 记录项完成轮回归（storage 面）。
 *
 * A｜enforceXToOnePredicates 批量化（r31 登记的性能项）：
 *   谓词纯落在关联记录自身时，逐父探针（N+1）合并为按父 id 集合的批量探针
 *   （IN + 命中 id 集判存活，与 findXToManyRelatedRecordsBatched 同构）。
 *   安全前提：谓词求值与「经由哪个父读到它」无关。pair 敏感谓词（filtered relation 的
 *   link 属性谓词 rebase 后带反向前缀）保持逐父探针——同一条关联记录经不同父的边
 *   可有不同 link 值，集合探针会把 P1 的合格边误判给 P2。
 *
 * B｜EXT-1（r29 登记的开放家族收口）：merged input 作为 x:1/combined 关系端点时，
 *   Setup 的合表移动（对视图端点合并实际移动整个物理 base）之后，filtered/merged-input
 *   视图记录的 record.table 指针仍是创建期快照的旧 base 表名——查询编译的 JOIN 落在
 *   幽灵表上（"no such column" fail-loud），buildTables 还会按幽灵指针建出多余的物理表。
 *   收敛修复：assignTableAndField 对**所有** recordToTableMap 内的记录（含视图名）统一
 *   以其为 table 真相源。fuzzer 生成域同步解锁（FUZZ_MERGED_FULL 门移除）。
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem } from "@runtime";
import { DBSetup, EntityQueryHandle, EntityToTableMap, MatchExp } from "@storage";
import { SQLiteDB } from "@drivers";
import { Entity, Property, Relation } from "@core";

async function setupSystem(entities: any[], relations: any[]) {
    const db = new SQLiteDB(":memory:");
    const system = new MonoSystem(db);
    const controller = new Controller({ system, entities, relations });
    await controller.setup(true);
    return { system, db };
}

describe("r32 — recorded items (storage)", () => {
    test("A1: batched x:1 predicate probe — pure related-side predicate over many parents nulls exactly the non-matching ones in one probe per batch", async () => {
        const Dept = Entity.create({
            name: "R32BDept",
            properties: [
                Property.create({ name: "title", type: "string" }),
                Property.create({ name: "kind", type: "string" }),
            ],
        });
        const User = Entity.create({
            name: "R32BUser",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const UserDept = Relation.create({
            source: User, sourceProperty: "dept",
            target: Dept, targetProperty: "members",
            type: "n:1",
        });
        const { system, db } = await setupSystem([Dept, User], [UserDept]);

        const eng = await system.storage.create("R32BDept", { title: "d-eng", kind: "eng" });
        const ops = await system.storage.create("R32BDept", { title: "d-ops", kind: "ops" });
        for (let i = 0; i < 3; i++) {
            await system.storage.create("R32BUser", { name: `e${i}`, dept: { id: eng.id } });
            await system.storage.create("R32BUser", { name: `o${i}`, dept: { id: ops.id } });
        }

        // 统计探针形态：批量面走 "enforce x:1 predicate (batched)"，逐父面走 "enforce x:1 predicate:"
        const probeNames: string[] = [];
        const realQuery = db.query.bind(db);
        (db as any).query = (sql: string, params: unknown[], name?: string) => {
            if (name?.startsWith("enforce x:1 predicate")) probeNames.push(name);
            return realQuery(sql, params, name);
        };

        const users = await system.storage.find(
            "R32BUser",
            undefined,
            undefined,
            ["id", "name", ["dept", { attributeQuery: ["id", "title"], matchExpression: MatchExp.atom({ key: "kind", value: ["=", "eng"] }) }]]
        );
        expect(users).toHaveLength(6);
        for (const user of users) {
            if (String(user.name).startsWith("e")) {
                expect(user.dept?.title).toBe("d-eng");
            } else {
                expect(user.dept ?? null).toBeNull();
            }
        }
        // 6 个父记录共用一次批量探针（<500 一批），不再是 6 次逐父探针
        expect(probeNames).toEqual(["enforce x:1 predicate (batched): R32BUser.dept"]);
        await db.close();
    });

    test("A2 (soundness guard): pair-sensitive link-attribute predicate keeps per-parent probes — a related record shared by two parents with different link values stays per-pair correct", async () => {
        // filtered x:1 relation 谓词落在 link 属性上：同一个 Dept 被 P1（isPrimary=true 的边）
        // 与 P2（isPrimary=false 的边）共享。集合级探针会因 P1 的边命中而放过 P2。
        const Dept = Entity.create({
            name: "R32PDept",
            properties: [Property.create({ name: "title", type: "string" })],
        });
        const User = Entity.create({
            name: "R32PUser",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const UserDept = Relation.create({
            source: User, sourceProperty: "dept",
            target: Dept, targetProperty: "members",
            type: "n:1",
            properties: [Property.create({ name: "isPrimary", type: "boolean" })],
        });
        const PrimaryUserDept = Relation.create({
            name: "R32PPrimaryUserDept",
            sourceProperty: "primaryDept",
            targetProperty: "primaryMembers",
            baseRelation: UserDept,
            matchExpression: MatchExp.atom({ key: "isPrimary", value: ["=", true] }),
        });
        const { system, db } = await setupSystem([Dept, User], [UserDept, PrimaryUserDept]);

        const dept = await system.storage.create("R32PDept", { title: "shared" });
        const p1 = await system.storage.create("R32PUser", { name: "p1" });
        const p2 = await system.storage.create("R32PUser", { name: "p2" });
        await system.storage.addRelationByNameById(UserDept.name!, String(p1.id), String(dept.id), { isPrimary: true });
        await system.storage.addRelationByNameById(UserDept.name!, String(p2.id), String(dept.id), { isPrimary: false });

        const probeNames: string[] = [];
        const realQuery = db.query.bind(db);
        (db as any).query = (sql: string, params: unknown[], name?: string) => {
            if (name?.startsWith("enforce x:1 predicate")) probeNames.push(name);
            return realQuery(sql, params, name);
        };

        const users = await system.storage.find(
            "R32PUser",
            undefined,
            undefined,
            ["id", "name", ["primaryDept", { attributeQuery: ["id", "title"] }]]
        );
        const byName = Object.fromEntries(users.map(user => [user.name, user]));
        expect(byName.p1.primaryDept?.title).toBe("shared");
        expect(byName.p2.primaryDept ?? null).toBeNull();
        // pair 敏感谓词必须保持逐父探针（每个候选父一个）
        expect(probeNames.every(name => name.startsWith("enforce x:1 predicate:"))).toBe(true);
        expect(probeNames.length).toBeGreaterThanOrEqual(2);
        await db.close();
    });

    test("A3 (guard): filtered x:1 relation with an endpoint predicate batches and stays correct", async () => {
        // filtered relation 谓词 rebase 后落在关联记录自身（target.age > 18 → age > 18）——可批量。
        const Owner = Entity.create({
            name: "R32FOwner",
            properties: [Property.create({ name: "name", type: "string" })],
        });
        const Pet = Entity.create({
            name: "R32FPet",
            properties: [
                Property.create({ name: "petName", type: "string" }),
                Property.create({ name: "age", type: "number" }),
            ],
        });
        const OwnerPet = Relation.create({
            source: Owner, sourceProperty: "pet",
            target: Pet, targetProperty: "owners",
            type: "n:1",
        });
        const AdultPetRel = Relation.create({
            name: "R32FAdultOwnerPet",
            sourceProperty: "adultPet",
            targetProperty: "adultOwners",
            baseRelation: OwnerPet,
            matchExpression: MatchExp.atom({ key: "target.age", value: [">", 3] }),
        });
        const { system, db } = await setupSystem([Owner, Pet], [OwnerPet, AdultPetRel]);

        const old = await system.storage.create("R32FPet", { petName: "old", age: 8 });
        const young = await system.storage.create("R32FPet", { petName: "young", age: 1 });
        await system.storage.create("R32FOwner", { name: "a", pet: { id: old.id } });
        await system.storage.create("R32FOwner", { name: "b", pet: { id: young.id } });
        await system.storage.create("R32FOwner", { name: "c", pet: { id: old.id } });

        const probeNames: string[] = [];
        const realQuery = db.query.bind(db);
        (db as any).query = (sql: string, params: unknown[], name?: string) => {
            if (name?.startsWith("enforce x:1 predicate")) probeNames.push(name);
            return realQuery(sql, params, name);
        };

        const owners = await system.storage.find(
            "R32FOwner",
            undefined,
            undefined,
            ["id", "name", ["adultPet", { attributeQuery: ["id", "petName"] }]]
        );
        const byName = Object.fromEntries(owners.map(owner => [owner.name, owner]));
        expect(byName.a.adultPet?.petName).toBe("old");
        expect(byName.b.adultPet ?? null).toBeNull();
        expect(byName.c.adultPet?.petName).toBe("old");
        expect(probeNames).toEqual(["enforce x:1 predicate (batched): R32FOwner.pet"]);
        await db.close();
    });

    // ---------- B｜EXT-1：merged input 作为 x:1/combined 端点（fuzzer extended seed 2 最小化） ----------

    test("B1: merged input as a combined-chain endpoint — view table pointers follow the physical base through table combining (was: phantom table + no-such-column)", async () => {
        // 形状（seed 2 最小化）：M = merged(D, A)；B 与 C 经 mergeLinks 合表；
        // B --1:1 reliance--> D 触发对视图端点 D 的合表 ⇒ 整个物理 base M 被并进 B⊕C 表；
        // A --1:1--> B 的 merged-FK 列也落在合并后的表上。
        // 此前：A/D 的 record.table 停在旧 base 表名（幽灵表），任何经 B.in4 / A.out4 的
        // JOIN 编译对幽灵表引用合并表上的列 ⇒ "no such column"。
        const mkEntity = (name: string) => Entity.create({
            name,
            properties: [
                Property.create({ name: "label", type: "string" }),
                Property.create({ name: "score", type: "number" }),
            ],
        });
        const A = mkEntity("R32ExtA");
        const B = mkEntity("R32ExtB");
        const C = mkEntity("R32ExtC");
        const D = mkEntity("R32ExtD");
        const relations = [
            Relation.create({ name: "R32ExtBC", source: B, sourceProperty: "out0", target: C, targetProperty: "in0", type: "1:1" }),
            Relation.create({ name: "R32ExtBD", source: B, sourceProperty: "out2", target: D, targetProperty: "in2", type: "1:1", isTargetReliance: true }),
            Relation.create({ name: "R32ExtAB", source: A, sourceProperty: "out4", target: B, targetProperty: "in4", type: "1:1", properties: [Property.create({ name: "weight", type: "number" })] }),
        ];
        const M = Entity.create({ name: "R32ExtM", inputEntities: [D, A] });

        const db = new SQLiteDB(":memory:");
        await db.open();
        const setup = new DBSetup([A, B, C, D, M], relations, db, ["R32ExtB.out0"]);
        await setup.createTables();
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);

        // 装配一致性：视图（merged input）的 table 指针必须等于其物理 base 的最终表
        const records = setup.map.records as any;
        expect(records.R32ExtA.table).toBe(records.R32ExtM.table);
        expect(records.R32ExtD.table).toBe(records.R32ExtM.table);
        // 幽灵表不再被建出：物理表集合 = 实际被指向的表
        const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'", []);
        expect(tables.map(t => t.name).sort()).toEqual([records.R32ExtM.table].sort());

        // 行为面：经 merged input 端点的关系写读全程可用
        const b = await handle.create("R32ExtB", { label: "b1", score: 1 });
        const a = await handle.create("R32ExtA", { label: "a1", score: 2, out4: { id: b.id } });
        const readB = await handle.find("R32ExtB", undefined, undefined, ["label", ["in4", { attributeQuery: ["label"] }]]);
        expect(readB.find(row => row.label === "b1")?.in4?.label).toBe("a1");
        const readA = await handle.findOne("R32ExtA", MatchExp.atom({ key: "id", value: ["=", a.id] }), undefined, ["label", ["out4", { attributeQuery: ["label"] }]]);
        expect(readA.out4?.label).toBe("b1");
        // merged 名读取（并集视图）看到 A 的行
        const readM = await handle.find("R32ExtM", undefined, undefined, ["label"]);
        expect(readM.map(row => row.label)).toContain("a1");
        await db.close();
    });

    test("B2 (guard): plain filtered entity whose base gets table-combined keeps a live table pointer", async () => {
        // EXT-1 的同族普通面：filtered entity 的 base 被（非 merged 的）合表移动。
        const Host = Entity.create({ name: "R32GHost", properties: [Property.create({ name: "label", type: "string" })] });
        const Dep = Entity.create({ name: "R32GDep", properties: [Property.create({ name: "label", type: "string" }), Property.create({ name: "hot", type: "boolean" })] });
        const HotDep = Entity.create({ name: "R32GHotDep", baseEntity: Dep, matchExpression: MatchExp.atom({ key: "hot", value: ["=", true] }) });
        const HostDep = Relation.create({ source: Host, sourceProperty: "dep", target: Dep, targetProperty: "host", type: "1:1", isTargetReliance: true });

        const db = new SQLiteDB(":memory:");
        await db.open();
        const setup = new DBSetup([Host, Dep, HotDep], [HostDep], db);
        await setup.createTables();
        const records = setup.map.records as any;
        expect(records.R32GHotDep.table).toBe(records.R32GDep.table);
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db);
        await handle.create("R32GHost", { label: "h", dep: { label: "d", hot: true } });
        const hot = await handle.find("R32GHotDep", undefined, undefined, ["label"]);
        expect(hot.map(row => row.label)).toEqual(["d"]);
        await db.close();
    });
});
