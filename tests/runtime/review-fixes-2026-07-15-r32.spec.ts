/**
 * r32 记录项完成轮回归（runtime 面）。
 *
 * A｜_System_ (concept, key) 唯一守恒律（r12-I-1 的 _Dictionary_ 兄弟轨，r31 登记本轮收口）：
 *   set(concept, key) 的 find-then-create 竞态会写出同键双行（findOne 非确定、update 只改
 *   一行留幽灵）。复合唯一索引把静默双行变成数据库冲突；MonoSystem.set 把冲突转成
 *   RetryableWriteConflict——重试后 findOne 命中已提交行、走 update 轨（收敛）。
 *   复合维度：同 key 异 concept 是两条合法行（单列唯一会误拒），显式对照。
 *
 * B｜Transform 链上游收缩的迁移死路（r30-E 开放家族收口）：
 *   Product --TransformA--> Deal --TransformB--> Promo，V2 使部分 Deal 消失。
 *   此前：破坏性 scope 按迁移前数据独立评估各计算 ⇒ 链式依赖（TransformB）的级联删除
 *   无法进入 scope；writeComputationPatch 又无条件拒绝 delete patch ⇒ 无论怎么批准都
 *   走进同一条死路（kill-resume 死循环）。
 *   现在：scope 经「回滚事务内真实执行 rebuildPlan」收集（级联感知、精确 ids，diff 一轮
 *   给出）；执行期删除乐观执行 + 收集，重算结束时与已批准 scope 双向对账，不一致则回滚。
 *   兄弟格：硬删除属性（_isDeleted_）依赖上游 Transform 输出的级联删除同一机制覆盖。
 */
import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, SYSTEM_RECORD, ConstraintViolationError } from "@runtime";
import { KlassByName } from "interaqt";
import { RetryableWriteConflict } from "../../src/runtime/transaction.js";
import { MatchExp } from "@storage";
import { PGLiteDB } from "@drivers";
import { Custom, Dictionary, Entity, NonNullConstraint, Property, Summation, Transform } from "@core";
import { approveGeneratedMigrationDiff, migrateWithApproval } from "./helpers/migrationApproval.js";

describe("r32 — recorded items", () => {
    test("A1: _System_ carries a composite (concept, key) unique index — duplicate rows rejected, same key under another concept legal", async () => {
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [], relations: [] });
        await controller.setup(true);

        await system.storage.set("conceptA", "sharedKey", { n: 1 });
        // 同 (concept, key) 第二行必须撞唯一索引（此前静默双行）
        await expect(system.storage.create(SYSTEM_RECORD, { concept: "conceptA", key: "sharedKey", value: JSON.stringify({ n: 2 }) }))
            .rejects.toThrow(/unique/i);
        // 复合语义对照：同 key 异 concept 是合法的独立行
        await system.storage.set("conceptB", "sharedKey", { n: 3 });
        expect(await system.storage.get("conceptA", "sharedKey")).toEqual({ n: 1 });
        expect(await system.storage.get("conceptB", "sharedKey")).toEqual({ n: 3 });
        const rows = await system.storage.find(SYSTEM_RECORD, MatchExp.atom({ key: "key", value: ["=", "sharedKey"] }), undefined, ["*"]);
        expect(rows).toHaveLength(2);
        await system.destroy();
    });

    test("A2: storage.set(concept, key) converges when the row appears between findOne and create (retry path)", async () => {
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [], relations: [] });
        await controller.setup(true);

        // 模拟竞态窗口：让下一次 findOne(_System_) 落空（对方尚未提交），create 轨撞唯一索引。
        // 断言错误形态是 RetryableWriteConflict（可重试），而非裸数据库错误。
        await system.storage.set("raceConcept", "raceKey", 1);
        const storageAny = system.storage as any;
        const monkeyFindOne = storageAny.queryHandle.findOne.bind(storageAny.queryHandle);
        let missOnce = true;
        storageAny.queryHandle.findOne = async (...args: any[]) => {
            if (missOnce && args[0] === SYSTEM_RECORD) {
                missOnce = false;
                return undefined;
            }
            return monkeyFindOne(...args);
        };
        await expect(system.storage.set("raceConcept", "raceKey", 2)).rejects.toBeInstanceOf(RetryableWriteConflict);
        storageAny.queryHandle.findOne = monkeyFindOne;
        // 重试路径（重新走 set）收敛到 update 轨
        await system.storage.set("raceConcept", "raceKey", 3);
        expect(await system.storage.get("raceConcept", "raceKey")).toBe(3);
        const rows = await system.storage.find(
            SYSTEM_RECORD,
            MatchExp.atom({ key: "key", value: ["=", "raceKey"] }).and({ key: "concept", value: ["=", "raceConcept"] }),
            undefined,
            ["*"]
        );
        expect(rows).toHaveLength(1);
        await system.destroy();
    });

    // ---------- B｜r30-E：Transform 链上游收缩的迁移（级联感知 scope） ----------

    const buildChain = (version: 1 | 2) => {
        const Product = new Entity({
            name: "R32ChainProduct",
            properties: [new Property({ name: "price", type: "number" }, { uuid: "r32-chain-product-price" })],
        }, { uuid: "r32-chain-product" });
        const transformA = new Transform({
            record: Product,
            attributeQuery: ["id", "price"],
            callback: version === 1
                ? (item: any) => item.price > 0 ? [{ amount: item.price }] : []
                : (item: any) => item.price > 15 ? [{ amount: item.price }] : [],
        }, { uuid: "r32-chain-transform-a" });
        const Deal = new Entity({
            name: "R32ChainDeal",
            properties: [new Property({ name: "amount", type: "number" }, { uuid: "r32-chain-deal-amount" })],
            computation: transformA,
        }, { uuid: "r32-chain-deal" });
        const transformB = new Transform({
            record: Deal,
            attributeQuery: ["id", "amount"],
            callback: (item: any) => [{ label: `promo-${item.amount}` }],
        }, { uuid: "r32-chain-transform-b" });
        const Promo = new Entity({
            name: "R32ChainPromo",
            properties: [new Property({ name: "label", type: "string" }, { uuid: "r32-chain-promo-label" })],
            computation: transformB,
        }, { uuid: "r32-chain-promo" });
        return [Product, Deal, Promo];
    };

    test("B1: shrinking a Transform chain migrates in one approval round — diff carries cascade-exact deletion scope (was: unapprovable dead end)", async () => {
        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: buildChain(1), relations: [] }).setup(true);
        await systemV1.storage.create("R32ChainProduct", { price: 10 });
        await systemV1.storage.create("R32ChainProduct", { price: 20 });
        expect(await systemV1.storage.find("R32ChainPromo", undefined, undefined, ["id"])).toHaveLength(2);

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: buildChain(2), relations: [] });

        // diff（模拟执行）一轮给出两级删除的精确 ids——含链式依赖 TransformB 的级联删除
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        const dealScope = diff.safety.destructiveScopes.find(scope => scope.dataContext === "entity:R32ChainDeal");
        const promoScope = diff.safety.destructiveScopes.find(scope => scope.dataContext === "entity:R32ChainPromo");
        expect(dealScope?.ids).toHaveLength(1);
        expect(promoScope?.ids).toHaveLength(1);

        // 默认审批流（批准生成的 diff）单轮收敛
        await migrateWithApproval(controllerV2);
        expect((await systemV2.storage.find("R32ChainDeal", undefined, undefined, ["amount"])).map(item => item.amount)).toEqual([20]);
        expect((await systemV2.storage.find("R32ChainPromo", undefined, undefined, ["label"])).map(item => item.label)).toEqual(["promo-20"]);
        await db.close();
    });

    test("B2: unapproved cascade deletions fail the executed-vs-approved audit and roll back completely", async () => {
        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: buildChain(1), relations: [] }).setup(true);
        await systemV1.storage.create("R32ChainProduct", { price: 10 });
        await systemV1.storage.create("R32ChainProduct", { price: 20 });

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: buildChain(2), relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        // 只批准 Deal 的删除、抹掉 Promo（级联）的批准 ⇒ 执行期对账失败并整体回滚
        const withoutCascade = {
            ...approvedDiff,
            decisions: approvedDiff.decisions.filter(decision => !(decision.kind === "destructive-scope" && decision.dataContext === "entity:R32ChainPromo")),
        };
        await expect(migrateWithApproval(controllerV2, { approvedDiff: withoutCascade })).rejects.toThrow(/scope mismatch[\s\S]*R32ChainPromo/);
        // 整体回滚：两级输出原样保留（经 V1 storage 读取）
        expect(await systemV1.storage.find("R32ChainDeal", undefined, undefined, ["id"])).toHaveLength(2);
        expect(await systemV1.storage.find("R32ChainPromo", undefined, undefined, ["id"])).toHaveLength(2);
        await db.close();
    });

    test("B3 (sibling cell): a hard-deletion property depending on upstream Transform output gets a cascade-aware scope", async () => {
        // Alert._isDeleted_ = 「amount 不在（经全局 dict 聚合的）Deal amounts 里」——宿主删除集
        // 取决于上游迁移后状态。分析性一阶 scope（按迁移前数据求值）会给出空集；模拟执行给出真实级联删除。
        const buildModel = (version: 1 | 2) => {
            const Product = new Entity({
                name: "R32HdProduct",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "r32-hd-product-price" })],
            }, { uuid: "r32-hd-product" });
            const transformA = new Transform({
                record: Product,
                attributeQuery: ["id", "price"],
                callback: version === 1
                    ? (item: any) => item.price > 0 ? [{ amount: item.price }] : []
                    : (item: any) => item.price > 15 ? [{ amount: item.price }] : [],
            }, { uuid: "r32-hd-transform-a" });
            const Deal = new Entity({
                name: "R32HdDeal",
                properties: [new Property({ name: "amount", type: "number" }, { uuid: "r32-hd-deal-amount" })],
                computation: transformA,
            }, { uuid: "r32-hd-deal" });
            const dealAmounts = new Dictionary({
                name: "r32HdDealAmounts",
                type: "json",
                collection: false,
                computation: new Custom({
                    name: "R32HdDealAmountsAgg",
                    dataDeps: { deals: { type: "records", source: Deal, attributeQuery: ["amount"] } },
                    compute: async function (deps: any) {
                        return (deps.deals || []).map((deal: any) => deal.amount);
                    },
                }, { uuid: "r32-hd-deal-amounts-computation" }),
            }, { uuid: "r32-hd-deal-amounts" });
            const Alert = new Entity({
                name: "R32HdAlert",
                properties: [
                    new Property({ name: "amount", type: "number" }, { uuid: "r32-hd-alert-amount" }),
                    new Property({
                        name: "_isDeleted_", type: "boolean",
                        computation: new Custom({
                            name: "R32HdAlertGc",
                            dataDeps: {
                                _current: { type: "property", attributeQuery: ["amount"] },
                                amounts: { type: "global", source: dealAmounts },
                            },
                            compute: async function (deps: any, record: any) {
                                return !(deps.amounts || []).includes(deps._current?.amount ?? record?.amount);
                            },
                        }, { uuid: "r32-hd-alert-gc-computation" }),
                    }, { uuid: "r32-hd-alert-is-deleted" }),
                ],
            }, { uuid: "r32-hd-alert" });
            return { entities: [Product, Deal, Alert], dict: [dealAmounts] };
        };

        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const modelV1 = buildModel(1);
        await new Controller({ system: systemV1, entities: modelV1.entities, relations: [], dict: modelV1.dict }).setup(true);
        await systemV1.storage.create("R32HdProduct", { price: 10 });
        await systemV1.storage.create("R32HdProduct", { price: 20 });
        const alert10 = await systemV1.storage.create("R32HdAlert", { amount: 10 });
        await systemV1.storage.create("R32HdAlert", { amount: 20 });
        expect(await systemV1.storage.find("R32HdAlert", undefined, undefined, ["id"])).toHaveLength(2);

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const modelV2 = buildModel(2);
        const controllerV2 = new Controller({ system: systemV2, entities: modelV2.entities, relations: [], dict: modelV2.dict });
        const diff = await controllerV2.generateMigrationDiff({ includeDestructiveScope: true });
        const alertScope = diff.safety.destructiveScopes.find(scope => scope.dataContext === "property:R32HdAlert._isDeleted_");
        // 级联感知：amount=10 的 Deal 迁移后消失 ⇒ alert10 成为删除对象（分析性求值会漏掉它）
        expect(alertScope?.ids).toEqual([String(alert10.id)]);

        await migrateWithApproval(controllerV2);
        const remaining = await systemV2.storage.find("R32HdAlert", undefined, undefined, ["amount"]);
        expect(remaining.map(item => item.amount)).toEqual([20]);
        await db.close();
    });

    test("B4 (fallback loop): when scope simulation is unavailable, the audit error reports all cascade ids and one re-approval converges", async () => {
        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: buildChain(1), relations: [] }).setup(true);
        await systemV1.storage.create("R32ChainProduct", { price: 10 });
        await systemV1.storage.create("R32ChainProduct", { price: 20 });
        const dealsBefore = await systemV1.storage.find("R32ChainDeal", undefined, undefined, ["id", "amount"]);
        const promosBefore = await systemV1.storage.find("R32ChainPromo", undefined, undefined, ["id", "label"]);
        const staleDealIds = dealsBefore.filter(item => item.amount === 10).map(item => String(item.id));
        const stalePromoIds = promosBefore.filter(item => item.label === "promo-10").map(item => String(item.id));

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: buildChain(2), relations: [] });
        // 使模拟不可行（按事务名拦截），走分析性回退 + 执行期对账
        const storageAny = systemV2.storage as any;
        const realRunInTransaction = storageAny.runInTransaction.bind(storageAny);
        storageAny.runInTransaction = async (options: any, fn: any) => {
            if (options?.name === "migration deletion-scope simulation") {
                throw new Error("simulated: scope simulation unavailable");
            }
            return realRunInTransaction(options, fn);
        };

        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        // 模拟不可行 ⇒ diff 无 scope 条目（分析轨在 queryHandle 未初始化时跳过 Transform scope）
        expect(approvedDiff.decisions.filter(decision => decision.kind === "destructive-scope")).toHaveLength(0);
        // 第一次迁移：执行期对账失败，错误一次性列出两级删除的精确 ids，事务回滚
        let auditError: Error | undefined;
        await migrateWithApproval(controllerV2, { approvedDiff }).catch(error => { auditError = error; });
        expect(String(auditError)).toMatch(/scope mismatch/);
        expect(String(auditError)).toContain(staleDealIds[0]);
        expect(String(auditError)).toContain(stalePromoIds[0]);
        expect(await systemV1.storage.find("R32ChainPromo", undefined, undefined, ["id"])).toHaveLength(2);

        // 按错误报告的 ids 批准 ⇒ 单次重试收敛
        const reApproved = {
            ...approvedDiff,
            decisions: [
                ...approvedDiff.decisions,
                { kind: "destructive-scope" as const, dataContext: "entity:R32ChainDeal", recordName: "R32ChainDeal", ids: staleDealIds, reason: "approved from audit error report" },
                { kind: "destructive-scope" as const, dataContext: "entity:R32ChainPromo", recordName: "R32ChainPromo", ids: stalePromoIds, reason: "approved from audit error report" },
            ],
        };
        await migrateWithApproval(controllerV2, { approvedDiff: reApproved as any });
        expect((await systemV2.storage.find("R32ChainPromo", undefined, undefined, ["label"])).map(item => item.label)).toEqual(["promo-20"]);
        await db.close();
    });

    // ---------- C｜r31 测试债：迁移 patch 事件 oldRecord 完备性的直接行为断言 ----------

    test("C: migration update-patch events carry complete oldRecord — filtered-membership exits on a three-level Transform chain are detected (r31 contract, direct positive proof)", async () => {
        // Product --TransformA--> Deal --TransformB--> Promo；BigPromo = filtered(Promo, value > 15)；
        // bigPromoSum = Summation(BigPromo.value)。
        // V2 只改 TransformA：price 10 → amount 30（Promo 10→30 **进入** BigPromo），
        // price 20 → amount 11（Promo 20→11 **退出** BigPromo）。
        // TransformB 是链式依赖：其对 Promo 的 update patch 事件由 writeComputationPatch 合成——
        // bigPromoSum 的成员资格判定（resolveFilteredUpdateEvent）读这些事件的 oldRecord 判断
        // 「此前是否是成员」。oldRecord 若是 {id}-only（r31 修复前形态），退出面判定失真，
        // 汇总残留退出成员的旧值。断言迁移后 sum 恰为 30（若退出漏判则为 50/41 等）。
        const buildModel = (version: 1 | 2) => {
            const Product = new Entity({
                name: "R32OldRecProduct",
                properties: [new Property({ name: "price", type: "number" }, { uuid: "r32-oldrec-product-price" })],
            }, { uuid: "r32-oldrec-product" });
            const transformA = new Transform({
                record: Product,
                attributeQuery: ["id", "price"],
                callback: version === 1
                    ? (item: any) => [{ amount: item.price }]
                    : (item: any) => [{ amount: item.price > 15 ? item.price - 9 : item.price * 3 }],
            }, { uuid: "r32-oldrec-transform-a" });
            const Deal = new Entity({
                name: "R32OldRecDeal",
                properties: [new Property({ name: "amount", type: "number" }, { uuid: "r32-oldrec-deal-amount" })],
                computation: transformA,
            }, { uuid: "r32-oldrec-deal" });
            const transformB = new Transform({
                record: Deal,
                attributeQuery: ["id", "amount"],
                callback: (item: any) => [{ value: item.amount }],
            }, { uuid: "r32-oldrec-transform-b" });
            const Promo = new Entity({
                name: "R32OldRecPromo",
                properties: [new Property({ name: "value", type: "number" }, { uuid: "r32-oldrec-promo-value" })],
                computation: transformB,
            }, { uuid: "r32-oldrec-promo" });
            const BigPromo = new Entity({
                name: "R32OldRecBigPromo",
                baseEntity: Promo,
                matchExpression: MatchExp.atom({ key: "value", value: [">", 15] }),
            }, { uuid: "r32-oldrec-big-promo" });
            const bigPromoSum = new Dictionary({
                name: "r32OldRecBigPromoSum",
                type: "number",
                collection: false,
                computation: new Summation({
                    record: BigPromo,
                    attributeQuery: ["value"],
                }, { uuid: "r32-oldrec-big-promo-sum-computation" }),
            }, { uuid: "r32-oldrec-big-promo-sum" });
            return { entities: [Product, Deal, Promo, BigPromo], dict: [bigPromoSum] };
        };

        const db = new PGLiteDB();
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const modelV1 = buildModel(1);
        await new Controller({ system: systemV1, entities: modelV1.entities, relations: [], dict: modelV1.dict }).setup(true);
        await systemV1.storage.create("R32OldRecProduct", { price: 10 });
        await systemV1.storage.create("R32OldRecProduct", { price: 20 });
        expect(await systemV1.storage.dict.get("r32OldRecBigPromoSum")).toBe(20);
        const promosBefore = await systemV1.storage.find("R32OldRecPromo", undefined, undefined, ["id", "value"]);

        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const modelV2 = buildModel(2);
        const controllerV2 = new Controller({ system: systemV2, entities: modelV2.entities, relations: [], dict: modelV2.dict });
        await migrateWithApproval(controllerV2);

        // 迁移是 update patch 面（无删除/重建）：Promo 逻辑 id 保持不变
        const promosAfter = await systemV2.storage.find("R32OldRecPromo", undefined, undefined, ["id", "value"]);
        expect(promosAfter.map(item => String(item.id)).sort()).toEqual(promosBefore.map(item => String(item.id)).sort());
        expect(promosAfter.map(item => item.value).sort((a, b) => a - b)).toEqual([11, 30]);
        // 进入 + 退出双向成员资格变化都被检出：sum 恰为 30（退出漏判 ⇒ 50/41；进入漏判 ⇒ 0/11）
        expect(await systemV2.storage.dict.get("r32OldRecBigPromoSum")).toBe(30);
        await db.close();
    });

    // ---------- D｜r28 记录项：NonNullConstraint 运行期命中归一为 ConstraintViolationError ----------

    test("D: a runtime NOT NULL (CHECK) violation maps to ConstraintViolationError kind 'non-null' (was: bare driver error)", async () => {
        const Doc = Entity.create({
            name: "R32NnDoc",
            properties: [Property.create({ name: "title", type: "string" })],
            constraints: [NonNullConstraint.create({ name: "r32_doc_title_not_null", property: "title" })],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await controller.setup(true);

        const doc = await system.storage.create("R32NnDoc", { title: "t1" });
        let violation: unknown;
        await system.storage.update("R32NnDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { title: null }).catch(error => { violation = error; });
        expect(violation).toBeInstanceOf(ConstraintViolationError);
        expect((violation as ConstraintViolationError).constraintName).toBe("r32_doc_title_not_null");
        expect(((violation as any).context ?? (violation as any)).kind ?? (violation as any).context?.kind).toBeDefined();
        expect(String((violation as Error).message)).toMatch(/non-null/i);
        // 合法写不受扰
        await system.storage.update("R32NnDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { title: "t2" });
        expect((await system.storage.findOne("R32NnDoc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), undefined, ["title"])).title).toBe("t2");
        await system.destroy();
    });

    // ---------- E｜r28 记录项：同名 Dictionary 的声明期报错质量 ----------

    test("E: duplicate Dictionary names fail at Controller construction with an actionable message (was: distant 'Migration identity is ambiguous')", () => {
        const mkDict = () => new Dictionary({ name: "r32DupDict", type: "number", collection: false }, {});
        expect(() => new Controller({
            system: new MonoSystem(new PGLiteDB()),
            entities: [], relations: [],
            dict: [mkDict(), mkDict()],
        })).toThrow(/Duplicate Dictionary name "r32DupDict"[\s\S]*Rename one/);
    });
});
