/**
 * r32 记录项完成轮回归（storage 面）。
 *
 * A｜enforceXToOnePredicates 批量化（r31 登记的性能项）：
 *   谓词纯落在关联记录自身时，逐父探针（N+1）合并为按父 id 集合的批量探针
 *   （IN + 命中 id 集判存活，与 findXToManyRelatedRecordsBatched 同构）。
 *   安全前提：谓词求值与「经由哪个父读到它」无关。pair 敏感谓词（filtered relation 的
 *   link 属性谓词 rebase 后带反向前缀）保持逐父探针——同一条关联记录经不同父的边
 *   可有不同 link 值，集合探针会把 P1 的合格边误判给 P2。
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem } from "@runtime";
import { MatchExp } from "@storage";
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
});
