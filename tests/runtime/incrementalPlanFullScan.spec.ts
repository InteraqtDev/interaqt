import { describe, expect, test } from "vitest";
import {
    Controller,
    Dictionary,
    Entity,
    KlassByName,
    MatchExp,
    MonoSystem,
    Property,
    Transform,
    Count,
    Custom,
    ComputationResult,
} from "interaqt";
import { PGLiteDB } from "@drivers";
import { ComputationProtocolError } from "../../src/runtime/errors/index.js";
import { type DataBasedComputation, type DataContext, type DataDep } from "../../src/runtime/computations/Computation.js";

const waitForListeners = () => new Promise(resolve => setTimeout(resolve, 250));

function spyStorageReads(system: MonoSystem) {
    const findCalls: any[][] = [];
    const findOneCalls: any[][] = [];
    const originalFind = system.storage.find.bind(system.storage);
    const originalFindOne = system.storage.findOne.bind(system.storage);
    (system.storage as any).find = async (...args: any[]) => {
        findCalls.push(args);
        return (originalFind as any)(...args);
    };
    (system.storage as any).findOne = async (...args: any[]) => {
        findOneCalls.push(args);
        return (originalFindOne as any)(...args);
    };
    return {
        findCalls,
        findOneCalls,
        clear() {
            findCalls.length = 0;
            findOneCalls.length = 0;
        },
        restore() {
            (system.storage as any).find = originalFind;
            (system.storage as any).findOne = originalFindOne;
        }
    };
}

describe("data-based incremental planning avoids eager full scans", () => {
    test("Transform record create does not resolve the _source records dep before patching", async () => {
        const Source = Entity.create({
            name: "PlanTransformSource",
            properties: [Property.create({ name: "value", type: "string" })],
        });
        const Target = Entity.create({
            name: "PlanTransformTarget",
            properties: [Property.create({ name: "mapped", type: "string" })],
            computation: Transform.create({
                record: Source,
                attributeQuery: ["value"],
                callback(source: any) {
                    return { mapped: `mapped:${source.value}` };
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Source, Target], relations: [] });
        await controller.setup(true);

        const reads = spyStorageReads(system);
        reads.clear();
        await system.storage.create("PlanTransformSource", { value: "one" });
        await waitForListeners();

        const targets = await system.storage.find("PlanTransformTarget", undefined, undefined, ["mapped"]);
        expect(targets).toHaveLength(1);
        expect(targets[0].mapped).toBe("mapped:one");
        expect(reads.findCalls.some(([recordName, match]) => recordName === "PlanTransformSource" && match === undefined)).toBe(false);
        expect(reads.findOneCalls.some(([recordName]) => recordName === "PlanTransformSource")).toBe(true);

        reads.restore();
        await system.destroy();
    });

    test("Global Count create skips the main records dep but still computes correctly", async () => {
        const Source = Entity.create({
            name: "PlanCountSource",
            properties: [Property.create({ name: "active", type: "boolean" })],
        });
        const total = Dictionary.create({
            name: "planCountTotal",
            type: "number",
            computation: Count.create({
                record: Source,
                attributeQuery: ["active"],
                callback(item: any) {
                    return item.active === true;
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Source], relations: [], dict: [total] });
        await controller.setup(true);

        const reads = spyStorageReads(system);
        reads.clear();
        await system.storage.create("PlanCountSource", { active: true });
        await waitForListeners();

        expect(await system.storage.dict.get("planCountTotal")).toBe(1);
        expect(reads.findCalls.some(([recordName, match]) => recordName === "PlanCountSource" && match === undefined)).toBe(false);

        reads.restore();
        await system.destroy();
    });

    test("Custom incremental computations must declare an incremental plan", async () => {
        const result = Dictionary.create({
            name: "missingCustomPlanResult",
            type: "number",
            computation: Custom.create({
                name: "MissingPlan",
                incrementalCompute() {
                    return ComputationResult.skip();
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        expect(() => new Controller({ system, entities: [], relations: [], dict: [result] })).toThrow(ComputationProtocolError);
        await system.destroy();
    });

    test("partial data dependency resolution deduplicates keys and preserves key/value mapping", async () => {
        const Main = Entity.create({
            name: "PlanPartialMain",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const Extra = Entity.create({
            name: "PlanPartialExtra",
            properties: [Property.create({ name: "label", type: "string" })],
        });
        const total = Dictionary.create({
            name: "planPartialTotal",
            type: "number",
            computation: Count.create({
                record: Main,
                attributeQuery: ["value"],
                dataDeps: {
                    extra: {
                        type: "records",
                        source: Extra,
                        attributeQuery: ["label"],
                    },
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Main, Extra], relations: [], dict: [total] });
        await controller.setup(true);
        await system.storage.create("PlanPartialMain", { value: 1 });
        await system.storage.create("PlanPartialExtra", { label: "x" });

        const computation = controller.scheduler.computationsHandles.get(total)!;
        const deps = await controller.scheduler.resolveSelectedDataDeps(computation as any, undefined, ["extra", "main", "extra"]);
        expect(Object.keys(deps).sort()).toEqual(["extra", "main"]);
        expect(deps.extra).toMatchObject([{ label: "x" }]);
        expect(deps.main).toMatchObject([{ value: 1 }]);
        await expect(controller.scheduler.resolveSelectedDataDeps(computation as any, undefined, ["missing"])).rejects.toThrow("Unknown data dependency");

        await system.destroy();
    });

    test("records data dependency full resolve passes match and modifier to storage", async () => {
        const Item = Entity.create({
            name: "PlanMatchItem",
            properties: [
                Property.create({ name: "kind", type: "string" }),
                Property.create({ name: "rank", type: "number" }),
            ],
        });
        const dict = Dictionary.create({ name: "planMatchDummy", type: "number" });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        await controller.setup(true);

        const reads = spyStorageReads(system);
        const match = MatchExp.atom({ key: "kind", value: ["=", "a"] });
        const modifier = { orderBy: { rank: "DESC" as const }, limit: 1 };
        await controller.scheduler.resolveAllDataDeps({
            dataContext: { type: "global", id: dict },
            args: { constructor: { displayName: "TestComputation" } },
            state: {},
            dataDeps: {
                items: {
                    type: "records",
                    source: Item,
                    match,
                    modifier,
                    attributeQuery: ["kind"],
                },
            },
        });

        expect(reads.findCalls.at(-1)?.[0]).toBe("PlanMatchItem");
        expect(reads.findCalls.at(-1)?.[1]).toBe(match);
        expect(reads.findCalls.at(-1)?.[2]).toBe(modifier);

        reads.restore();
        await system.destroy();
    });

    test("records match skips non-matching create events and full recomputes membership boundary updates", async () => {
        const Item = Entity.create({
            name: "PlanMatchMembershipItem",
            properties: [
                Property.create({ name: "status", type: "string" }),
                Property.create({ name: "value", type: "number" }),
            ],
        });
        let computeCalls = 0;
        let incrementalCalls = 0;
        const total = Dictionary.create({
            name: "planMatchMembershipTotal",
            type: "number",
            computation: Custom.create({
                name: "PlanMatchMembershipTotal",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Item,
                        match: MatchExp.atom({ key: "status", value: ["=", "active"] }),
                        attributeQuery: ["status", "value"],
                    },
                },
                incrementalDataDeps: [],
                compute(dataDeps: any) {
                    computeCalls++;
                    return (dataDeps.items || []).reduce((sum: number, item: any) => sum + item.value, 0);
                },
                incrementalCompute(_lastValue: unknown, event: any) {
                    incrementalCalls++;
                    return event.record.value;
                },
                getInitialValue: () => 0,
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [total] });
        await controller.setup(true);

        computeCalls = 0;
        incrementalCalls = 0;
        const inactive = await system.storage.create("PlanMatchMembershipItem", { status: "inactive", value: 5 });
        await waitForListeners();
        expect(await system.storage.dict.get("planMatchMembershipTotal")).toBe(0);
        expect(incrementalCalls).toBe(0);
        expect(computeCalls).toBe(0);

        await system.storage.update("PlanMatchMembershipItem", MatchExp.atom({ key: "id", value: ["=", inactive.id] }), { status: "active" });
        await waitForListeners();
        expect(await system.storage.dict.get("planMatchMembershipTotal")).toBe(5);
        expect(computeCalls).toBe(1);

        await system.destroy();
    });

    test("records modifier orderBy updates trigger planned full recompute before partial deps", async () => {
        const Item = Entity.create({
            name: "PlanModifierItem",
            properties: [
                Property.create({ name: "label", type: "string" }),
                Property.create({ name: "priority", type: "number" }),
            ],
        });
        let computeCalls = 0;
        let incrementalCalls = 0;
        const first = Dictionary.create({
            name: "planModifierFirst",
            type: "string",
            computation: Custom.create({
                name: "PlanModifierFirst",
                dataDeps: {
                    items: {
                        type: "records",
                        source: Item,
                        modifier: { orderBy: { priority: "DESC" }, limit: 1 },
                        attributeQuery: ["label"],
                    },
                },
                incrementalDataDeps: [],
                compute(dataDeps: any) {
                    computeCalls++;
                    return dataDeps.items?.[0]?.label || "";
                },
                incrementalCompute() {
                    incrementalCalls++;
                    return "incremental";
                },
                getInitialValue: () => "",
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [first] });
        await controller.setup(true);
        const low = await system.storage.create("PlanModifierItem", { label: "low", priority: 1 });
        await waitForListeners();
        await system.storage.create("PlanModifierItem", { label: "high", priority: 2 });
        await waitForListeners();

        computeCalls = 0;
        incrementalCalls = 0;
        await system.storage.update("PlanModifierItem", MatchExp.atom({ key: "id", value: ["=", low.id] }), { priority: 3 });
        await waitForListeners();

        expect(await system.storage.dict.get("planModifierFirst")).toBe("low");
        expect(computeCalls).toBe(1);
        expect(incrementalCalls).toBe(0);
        await system.destroy();
    });

    test("planned full recompute from data-based patch computation applies full entity output", async () => {
        const Trigger = Entity.create({
            name: "PlanPatchFullTrigger",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const Output = Entity.create({
            name: "PlanPatchFullOutput",
            properties: [Property.create({ name: "total", type: "number" })],
            computation: Custom.create({
                name: "PlanPatchFullOutputComputation",
                dataDeps: {
                    triggers: {
                        type: "records",
                        source: Trigger,
                        attributeQuery: ["value"],
                    },
                },
                compute(dataDeps: any) {
                    const total = (dataDeps.triggers || []).reduce((sum: number, item: any) => sum + item.value, 0);
                    return [{ total }];
                },
                planIncremental() {
                    return { type: "fullRecompute", reason: "exercise full result mode from patch computation" };
                },
                incrementalPatchCompute() {
                    return { type: "insert", data: { total: -1 } };
                },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Trigger, Output], relations: [] });
        await controller.setup(true);

        await system.storage.create("PlanPatchFullTrigger", { value: 7 });
        await waitForListeners();

        const outputs = await system.storage.find("PlanPatchFullOutput", undefined, undefined, ["total"]);
        expect(outputs).toHaveLength(1);
        expect(outputs[0].total).toBe(7);
        await system.destroy();
    });

    test("entity/relation incremental last value requires explicit fullOutput policy", async () => {
        const Trigger = Entity.create({
            name: "PlanLastValueTrigger",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const Output = Entity.create({
            name: "PlanLastValueOutput",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Trigger, Output], relations: [] });
        await controller.setup(true);
        const dep: DataDep = { type: "records", source: Trigger, attributeQuery: ["value"] };
        const computation: DataBasedComputation = {
            dataContext: { type: "entity", id: Output },
            args: { constructor: { displayName: "PlanLastValueComputation" } },
            state: {},
            dataDeps: { trigger: dep },
            primaryDataDepKeys: ["trigger"],
            incrementalCompute: async () => [],
            planIncremental: () => ({ type: "incremental", dataDepKeys: [], needsLastValue: true }),
        };

        await expect(controller.scheduler.executeDataBasedComputation(computation, {
            dataDep: dep,
            type: "create",
            recordName: "PlanLastValueTrigger",
            record: { id: "t1", value: 1 },
        })).rejects.toThrow(ComputationProtocolError);
        await system.destroy();
    });

    test("third-party incremental data-based computation fails during setup without planIncremental", async () => {
        class ThirdPartyCore {
            static displayName = "ThirdPartyCore";
            uuid = "third-party-core";
        }
        class ThirdPartyHandle implements DataBasedComputation {
            static computationType = ThirdPartyCore;
            static contextType = "global" as const;
            state = {};
            dataDeps: Record<string, DataDep>;
            constructor(_controller: Controller, public args: ThirdPartyCore, public dataContext: DataContext) {
                this.dataDeps = {
                    items: {
                        type: "records",
                        source: ThirdPartyItem,
                        attributeQuery: ["value"],
                    },
                };
            }
            async incrementalCompute() {
                return 0;
            }
        }
        const ThirdPartyItem = Entity.create({
            name: "PlanThirdPartyItem",
            properties: [Property.create({ name: "value", type: "number" })],
        });
        const dict = Dictionary.create({
            name: "planThirdPartyValue",
            type: "number",
            computation: new ThirdPartyCore() as any,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ThirdPartyItem],
            relations: [],
            dict: [dict],
            computations: [ThirdPartyHandle],
        });

        await expect(controller.setup(true)).rejects.toThrow("planIncremental");
        await system.destroy();
    });
});
