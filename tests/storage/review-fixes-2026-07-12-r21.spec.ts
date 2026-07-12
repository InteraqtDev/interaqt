/**
 * r21 深度审查回归（storage 面）。
 *
 * F-2 —— combined 拓扑经 addRelation（addLink）抢夺：旧 owner 的 filtered entity delete 事件缺失。
 *   r19 F-3 修了 create/update 抢夺（业务属性 ref 形态，flashOut 内按宿主收 collectMembershipChecks），
 *   但 addRelation 形态下正在创建的是 link record，combinedRecordIdRefs 是虚拟端点 ref
 *   （isLinkSourceRelation），旧 owner 收口分支被守卫排除——查询面正确（旧 owner 退出视图）、
 *   事件面零 delete，下游对该视图的响应式计算永久陈旧。同一家族的兄弟格。
 *   修复：flashOut 对每条手工 push 的旧 link delete（旧业务 link / 被替换的旧 merged link）
 *   统一按 deleteRecord 的契约采集两端实体的成员资格快照（collectLinkMembershipChecks），
 *   物理清列后与既有 oldOwnerMembershipChecks 一并结算。
 *   顺带：flashOut 的 ref 循环此前对虚拟端点 ref 也 push 了 delete 事件（recordName 是
 *   `<relation>_source/_target` 虚拟 link 名）——storage 从不以虚拟 link 名发事件（r18 死监听
 *   不变量的对偶面），该幻影事件已移除。
 *
 * F-3 —— between 边界含 null/undefined：SQL `BETWEEN NULL AND x` 恒为 UNKNOWN，静默匹配零行。
 *   与 =/!=（IS NULL 翻译）、in/not in（r20 编译期 null 拆分）的治理对齐：null 边界是矛盾声明，
 *   编译期 fail-fast，单边界区间用 ['>=', min] / ['<=', max] 显式表达。
 */
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from "interaqt";
import { PGLiteDB } from "@drivers";
import { describe, expect, test } from "vitest";
import type { RecordMutationEvent } from "@runtime";

describe("r21 F-2 — combined addRelation steal: old owner membership events", () => {
    function buildCombinedFixture() {
        const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
        const Profile = Entity.create({ name: "Profile", properties: [Property.create({ name: "title", type: "string" })] });
        const userProfile = Relation.create({
            name: "UserProfile",
            source: User, sourceProperty: "profile", target: Profile, targetProperty: "owner", type: "1:1",
        });
        const UserWithProfile = Entity.create({
            name: "UserWithProfile",
            baseEntity: User,
            matchExpression: MatchExp.atom({ key: "profile.id", value: ["not", null] }),
        });
        const VipProfile = Entity.create({
            name: "VipProfile",
            baseEntity: Profile,
            matchExpression: MatchExp.atom({ key: "owner.name", value: ["=", "VIP"] }),
        });
        return { User, Profile, userProfile, UserWithProfile, VipProfile };
    }

    async function setupCombined() {
        const { User, Profile, userProfile, UserWithProfile, VipProfile } = buildCombinedFixture();
        const db = new PGLiteDB();
        await db.open();
        const setup = new DBSetup([User, Profile, UserWithProfile, VipProfile], [userProfile], db, ["User.profile"]);
        await setup.createTables();
        return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
    }

    test("addRelation steal emits old-owner delete + new-owner create, and no virtual-link phantom events", async () => {
        const { db, handle } = await setupCombined();
        const u1 = await handle.create("User", { name: "VIP", profile: { title: "p" } });
        const u2 = await handle.create("User", { name: "regular" });
        const profileId = (await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", u1.id] }), undefined, ["id", ["profile", { attributeQuery: ["id"] }]])).profile.id;

        expect((await handle.find("UserWithProfile", undefined, undefined, ["id"])).map((r: any) => r.id)).toEqual([u1.id]);
        expect((await handle.find("VipProfile", undefined, undefined, ["id"])).map((r: any) => r.id)).toEqual([profileId]);

        const events: RecordMutationEvent[] = [];
        await handle.addRelationByNameById("UserProfile", u2.id, profileId, {}, events);

        // 查询面：u1 退出、u2 进入
        expect((await handle.find("UserWithProfile", undefined, undefined, ["id"])).map((r: any) => r.id)).toEqual([u2.id]);
        expect(await handle.find("VipProfile", undefined, undefined, ["id"])).toHaveLength(0);

        // 事件面：旧 owner 的 UserWithProfile delete + 新 owner 的 create
        expect(events.filter(e => e.recordName === "UserWithProfile" && e.type === "delete" && (e.record as any)?.id === u1.id)).toHaveLength(1);
        expect(events.filter(e => e.recordName === "UserWithProfile" && e.type === "create" && (e.record as any)?.id === u2.id)).toHaveLength(1);
        // 被抢夺 Profile 的跨宿主谓词视图：owner 从 VIP 变为 regular → VipProfile delete
        expect(events.filter(e => e.recordName === "VipProfile" && e.type === "delete" && (e.record as any)?.id === profileId)).toHaveLength(1);
        // 旧业务 link 的 delete 以业务名发出，虚拟 link 名（`<relation>_source/_target`）零事件
        expect(events.filter(e => e.recordName === "UserProfile" && e.type === "delete")).toHaveLength(1);
        expect(events.filter(e => /_source$|_target$/.test(e.recordName))).toHaveLength(0);
        await db.close();
    });

    test("control: create-steal keeps old-owner delete + stolen-profile cross-owner view delete (r19 F-3)", async () => {
        const { db, handle } = await setupCombined();
        const u1 = await handle.create("User", { name: "VIP", profile: { title: "p" } });
        const profileId = (await handle.findOne("User", MatchExp.atom({ key: "id", value: ["=", u1.id] }), undefined, ["id", ["profile", { attributeQuery: ["id"] }]])).profile.id;

        const events: RecordMutationEvent[] = [];
        const u2 = await handle.create("User", { name: "regular", profile: { id: profileId } }, events);

        expect((await handle.find("UserWithProfile", undefined, undefined, ["id"])).map((r: any) => r.id)).toEqual([u2.id]);
        expect(events.filter(e => e.recordName === "UserWithProfile" && e.type === "delete" && (e.record as any)?.id === u1.id)).toHaveLength(1);
        expect(events.filter(e => e.recordName === "VipProfile" && e.type === "delete" && (e.record as any)?.id === profileId)).toHaveLength(1);
        expect(events.filter(e => /_source$|_target$/.test(e.recordName))).toHaveLength(0);
        await db.close();
    });
});

describe("r21 F-3 — between with null/undefined bounds fails fast", () => {
    async function setupUsers() {
        const User = Entity.create({
            name: "BUser",
            properties: [
                Property.create({ name: "name", type: "string" }),
                Property.create({ name: "age", type: "number" }),
                Property.create({ name: "minAge", type: "number" }),
                Property.create({ name: "maxAge", type: "number" }),
            ],
        });
        const db = new PGLiteDB();
        await db.open();
        const setup = new DBSetup([User], [], db);
        await setup.createTables();
        return { db, handle: new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db) };
    }

    test("null / undefined bounds are rejected with guidance (was: silent zero rows)", async () => {
        const { db, handle } = await setupUsers();
        await handle.create("BUser", { name: "a", age: 30 });

        await expect(
            handle.find("BUser", MatchExp.atom({ key: "age", value: ["between", [null, 100]] }), undefined, ["name"])
        ).rejects.toThrowError(/between.*does not support null\/undefined bounds/s);
        await expect(
            handle.find("BUser", MatchExp.atom({ key: "age", value: ["between", [0, undefined]] as any }), undefined, ["name"])
        ).rejects.toThrowError(/between.*does not support null\/undefined bounds/s);
        await db.close();
    });

    test("valid literal bounds and reference bounds keep working", async () => {
        const { db, handle } = await setupUsers();
        await handle.create("BUser", { name: "in", age: 30, minAge: 10, maxAge: 50 });
        await handle.create("BUser", { name: "out", age: 90, minAge: 10, maxAge: 50 });

        const literal = await handle.find("BUser", MatchExp.atom({ key: "age", value: ["between", [20, 40]] }), undefined, ["name"]);
        expect(literal.map((r: any) => r.name)).toEqual(["in"]);

        const reference = await handle.find(
            "BUser",
            MatchExp.atom({ key: "age", value: ["between", ["minAge", "maxAge"]], isReferenceValue: true } as any),
            undefined,
            ["name"]
        );
        expect(reference.map((r: any) => r.name)).toEqual(["in"]);
        await db.close();
    });
});
