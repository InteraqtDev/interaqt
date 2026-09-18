/**
 * M-01（migration-state-machine-state-remap）：状态图变更的 diff 检测层。
 *
 * 覆盖：三类状态图变更（初始态改名 / 非初始态改名 / 增删节点）× property/global 作用域的
 * detected/requiredDecisions 断言；无状态图变化的对照（diff 与新检测正交）；Custom
 * createState 不触发要求的负向对照；modelHash 排除断言；旧格式 manifest（无 stateGraph
 * 字段）读回降级为「不比较」。
 *
 * M-02（执行层）：迁移后每条宿主记录/全局字典的 currentState 按批准的映射改名；随后
 * 真实 dispatch 依赖该状态的 Interaction，输出值与 currentState 双面断言（M-02 验收：
 * 只改输出值不改状态的错误实现必须被 currentState 列断言区分出来）。
 *
 * 不变量 fail-fast（M-04）继续扩展本文件。
 */
import { describe, expect, test } from "vitest";
import { Action, Controller, Count, Custom, Dictionary, Entity, Expression, GlobalBoundState, Interaction, InteractionEventEntity, KlassByName, MatchExp, MonoSystem, Payload, PayloadItem, Property, RealTime, StateMachine, StateNode, StateTransfer, Summation, Transform, USER_ENTITY, computationManifestId, createMigrationManifest, readMigrationManifest, recomputeChangedComputations, writeMigrationManifest } from "interaqt";
import { PGLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";
type MachineSpec = {
    stateNames: string[];
    initialStateName: string;
};

function buildPropertyModel(spec: MachineSpec) {
    const [first, second, third] = spec.stateNames;
    const node = (name: string) => new StateNode({ name });
    const machine = new StateMachine({
        states: [node(first), node(second), node(third)],
        transfers: [
            new StateTransfer({ trigger: { recordName: "StateGraphProbeTicket", type: "update" }, current: node(first), next: node(second), computeTarget: (event: any) => ({ id: event.record.id }) }),
            new StateTransfer({ trigger: { recordName: "StateGraphProbeTicket", type: "update" }, current: node(second), next: node(third), computeTarget: (event: any) => ({ id: event.record.id }) }),
        ],
        initialState: node(spec.initialStateName),
    });
    const Ticket = new Entity({
        name: "StateGraphProbeTicket",
        properties: [
            new Property({ name: "title", type: "string" }),
            new Property({ name: "status", type: "string", computation: machine }),
        ],
    });
    return { Ticket, machine };
}

function buildGlobalModel(spec: MachineSpec) {
    const [first, second, third] = spec.stateNames;
    const node = (name: string) => new StateNode({ name });
    const machine = new StateMachine({
        states: [node(first), node(second), node(third)],
        transfers: [
            new StateTransfer({ trigger: { recordName: "StateGraphProbeSource", type: "update" }, current: node(first), next: node(second) }),
            new StateTransfer({ trigger: { recordName: "StateGraphProbeSource", type: "update" }, current: node(second), next: node(third) }),
        ],
        initialState: node(spec.initialStateName),
    });
    const Source = new Entity({
        name: "StateGraphProbeSource",
        properties: [new Property({ name: "title", type: "string" })],
    });
    const dict = new Dictionary({ name: "stateGraphProbeGlobal", type: "string", collection: false, computation: machine });
    return { Source, dict, machine };
}

const V1_SPEC: MachineSpec = { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" };

async function setupV1(db: PGLiteDB) {
    const { Ticket } = buildPropertyModel(V1_SPEC);
    const { Source, dict } = buildGlobalModel(V1_SPEC);
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Ticket, Source], relations: [], dict: [dict] });
    await controller.setup(true);
    return { system, controller };
}

// 状态图变化的迁移必然要求 event rebuild handler（StateMachine 是 event-based 计算且
// 进入 rebuild 计划）；缺省 handler 会让 validateApprovedDiff 先在 handler 存在性上失败，
// 掩盖本文件要断言的 state-graph-mapping 决策校验。
const PROBE_EVENT_REBUILD_HANDLERS = {
    eventRebuild: {
        "property:StateGraphProbeTicket.status": async () => "pending",
        "global:stateGraphProbeGlobal": async () => "pending",
    },
};

function makeV2Controller(db: PGLiteDB, propertySpec: MachineSpec, globalSpec: MachineSpec) {
    const { Ticket } = buildPropertyModel(propertySpec);
    const { Source, dict } = buildGlobalModel(globalSpec);
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    return new Controller({ system, entities: [Ticket, Source], relations: [], dict: [dict] });
}

function computationChange(diff: Awaited<ReturnType<Controller["generateMigrationDiff"]>>, dataContext: string) {
    const change = diff.changes.find(item => item.kind === "computation" && item.dataContext === dataContext);
    expect(change).toBeDefined();
    return change as Extract<typeof change, { kind: "computation" }>;
}

function stateGraphRequirement(diff: Awaited<ReturnType<Controller["generateMigrationDiff"]>>, dataContext: string) {
    const requirement = diff.requiredDecisions.find(item => item.kind === "state-graph-mapping" && item.dataContext === dataContext);
    return requirement as Extract<typeof requirement, { kind: "state-graph-mapping" }> | undefined;
}

describe("StateMachine state graph migration detection (M-01)", () => {
    test("non-initial state rename is detected as stateGraphChanged and requires a state-graph-mapping decision", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        const spec: MachineSpec = { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const diff = await controllerV2.generateMigrationDiff();

        const propertyChange = computationChange(diff, "property:StateGraphProbeTicket.status");
        expect(propertyChange.detected.stateGraphChanged).toBe(true);
        const globalChange = computationChange(diff, "global:stateGraphProbeGlobal");
        expect(globalChange.detected.stateGraphChanged).toBe(true);

        const propertyRequirement = stateGraphRequirement(diff, "property:StateGraphProbeTicket.status");
        expect(propertyRequirement).toMatchObject({ removedStateNames: ["approved"], addedStateNames: ["accepted"], nextInitialStateName: "pending" });
        expect(propertyRequirement?.nextNodeNames).toEqual(["pending", "accepted", "archived"]);
        const globalRequirement = stateGraphRequirement(diff, "global:stateGraphProbeGlobal");
        expect(globalRequirement).toMatchObject({ removedStateNames: ["approved"], addedStateNames: ["accepted"] });
        await db.close();
    });

    test("initial state rename is detected even though the old initial name may remain a legal node", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        const spec: MachineSpec = { stateNames: ["queued", "approved", "archived"], initialStateName: "queued" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const diff = await controllerV2.generateMigrationDiff();

        const change = computationChange(diff, "property:StateGraphProbeTicket.status");
        expect(change.detected.stateGraphChanged).toBe(true);
        const requirement = stateGraphRequirement(diff, "property:StateGraphProbeTicket.status");
        // pending 是被移除的节点名；映射必须覆盖它。
        expect(requirement?.removedStateNames).toEqual(["pending"]);
        expect(requirement?.addedStateNames).toEqual(["queued"]);
        expect(requirement?.nextInitialStateName).toBe("queued");
        await db.close();
    });

    test("state node removal (no replacement) requires mapping with no added names", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        // archived 节点及其转移被删除：旧名集合 {pending, approved, archived} -> 新名集合
        // {pending, approved}。removed = [archived]、added = []，映射只能指向仍合法的名或 null。
        const propertySpec: MachineSpec = { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" };
        const { Ticket } = buildPropertyModel(propertySpec);
        // 重建为两节点图：buildPropertyModel 固定声明两个 transfer，这里手工构造删除了
        // archived 的版本。
        const node = (name: string) => new StateNode({ name });
        const machine = new StateMachine({
            states: [node("pending"), node("approved")],
            transfers: [
                new StateTransfer({ trigger: { recordName: "StateGraphProbeTicket", type: "update" }, current: node("pending"), next: node("approved"), computeTarget: (event: any) => ({ id: event.record.id }) }),
            ],
            initialState: node("pending"),
        });
        const TicketTwo = new Entity({
            name: "StateGraphProbeTicket",
            properties: [
                new Property({ name: "title", type: "string" }),
                new Property({ name: "status", type: "string", computation: machine }),
            ],
        });
        void Ticket;
        const globalSpec: MachineSpec = { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" };
        const { Source, dict } = buildGlobalModel(globalSpec);
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system, entities: [TicketTwo, Source], relations: [], dict: [dict] });

        const diff = await controllerV2.generateMigrationDiff();
        const requirement = stateGraphRequirement(diff, "property:StateGraphProbeTicket.status");
        expect(requirement).toMatchObject({ removedStateNames: ["archived"], addedStateNames: [], nextInitialStateName: "pending" });
        expect(requirement?.nextNodeNames).toEqual(["pending", "approved"]);

        // 映射缺项 / 非法目标在 validateApprovedDiff 阶段被拒（dryRun 同样触发）。
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const findMappingDecision = (decisions: typeof approvedDiff.decisions) => {
            const decision = decisions.find(item => item.kind === "state-graph-mapping" && item.dataContext === "property:StateGraphProbeTicket.status");
            return decision as Extract<typeof decision, { kind: "state-graph-mapping" }> | undefined;
        };
        const mappingDecision = findMappingDecision(approvedDiff.decisions)!;
        expect(mappingDecision.mapping).toEqual({ archived: null });
        await expect(controllerV2.migrate({
            handlers: PROBE_EVENT_REBUILD_HANDLERS,
            approvedDiff: {
                ...approvedDiff,
                decisions: approvedDiff.decisions.filter(item => !(item.kind === "state-graph-mapping" && item.dataContext === "property:StateGraphProbeTicket.status")),
            },
        })).rejects.toThrow(/state-graph-mapping/);
        await expect(controllerV2.migrate({
            handlers: PROBE_EVENT_REBUILD_HANDLERS,
            approvedDiff: {
                ...approvedDiff,
                decisions: approvedDiff.decisions.map(item => item.kind === "state-graph-mapping" && item.dataContext === "property:StateGraphProbeTicket.status"
                    ? { ...item, mapping: { archived: "nonexistent" } }
                    : item),
            },
        })).rejects.toThrow(/outside the new state graph/);
        await db.close();
    });

    test("purely added node without removals does not require a mapping decision", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        // 新增 refunded 节点；旧名全部仍合法。
        const spec: MachineSpec = { stateNames: ["pending", "approved", "archived", "refunded"], initialStateName: "pending" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const diff = await controllerV2.generateMigrationDiff();

        const change = computationChange(diff, "property:StateGraphProbeTicket.status");
        expect(change.detected.stateGraphChanged).toBe(false);
        expect(stateGraphRequirement(diff, "property:StateGraphProbeTicket.status")).toBeUndefined();
        expect(stateGraphRequirement(diff, "global:stateGraphProbeGlobal")).toBeUndefined();
        await db.close();
    });

    test("no state graph change: state-graph-mapping never appears even when the machine has other changes", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        const controllerV2 = makeV2Controller(db, V1_SPEC, V1_SPEC);
        const diff = await controllerV2.generateMigrationDiff();
        // 同图重声明：StateMachine 计算无结构性变化。可能出现其它非状态图 change（如
        // computeTarget 函数文本的闭签风险 needs-review），与状态图检测正交。
        expect(diff.changes.some(item => item.kind === "computation" && item.detected.stateGraphChanged)).toBe(false);
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        await db.close();
    });

    test("Custom computation with createState does not produce state graph requirements", async () => {
        const db = new PGLiteDB();
        const buildCustom = (initial: number) => new Custom({
            name: "StateGraphProbeCustom",
            createState: () => ({ tracker: new GlobalBoundState(initial) }),
            compute: async () => 1,
        });
        const dictV1 = new Dictionary({ name: "stateGraphProbeCustomValue", type: "number", collection: false, computation: buildCustom(0) });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [], relations: [], dict: [dictV1] }).setup(true);

        const dictV2 = new Dictionary({ name: "stateGraphProbeCustomValue", type: "number", collection: false, computation: buildCustom(10) });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [], relations: [], dict: [dictV2] });
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        const manifest = createMigrationManifest(controllerV2);
        expect(manifest.computations.every(item => item.stateGraph === undefined)).toBe(true);
        await db.close();
    });

    test("modelHash excludes the stateGraph field", async () => {
        const db = new PGLiteDB();
        const { controller } = await setupV1(db);
        // 基线 manifest（setup(true) 写入）与同声明重算的 manifest：填充 stateGraph 的新代码
        // 必须产出相同 modelHash——stateGraph 是 diff 检测输入，不是签名输入。
        const manifest = createMigrationManifest(controller);
        const baseline = await readMigrationManifest(controller);
        expect(baseline).toBeDefined();
        expect(manifest.modelHash).toBe(baseline!.modelHash);
        // 非循环金值（实现审计轮补强）：上面的相等断言两边都由当前代码计算，删除
        // hashComputations 里对 stateGraph 的排除后仍然成立（缺陷注入证实：两个断言都
        // 是同一代码路径的自我一致，不能判别回归）。modelHash 对同一声明集跨进程确定
        // （UUID 是进程内递增计数器且被 stripIdentityUUID 排除），因此固定为本任务落地前
        // （基线 f9f06b3）代码计算出的字面量。若 stateGraph 进入 modelHash 输入，该字面量
        // 必然失配——这是唯一能独立判别「签名排除」的断言。
        expect(manifest.modelHash).toBe("c27d996588e0477cb08d44af5836546932a4ba7fb930dbccfb14647645ee0fc0");

        // 非循环断言（设计 M-01 验收）：把已存 manifest 的 stateGraph 字段抹掉、保留其
        // modelHash 写回，再用当前声明重算——若 stateGraph 进入 modelHash，两者必然不等。
        // 这同时模拟了「升级窗口」：旧版 manifest 无该字段，新代码不得因此误判模型变更。
        const legacy = {
            ...baseline!,
            computations: baseline!.computations.map(item => { const { stateGraph, ...rest } = item; void stateGraph; return rest; }),
        };
        await writeMigrationManifest(controller, legacy);
        expect(createMigrationManifest(controller).modelHash).toBe(legacy.modelHash);

        // 存储的 manifest 也确实带 stateGraph（基线本身填充了该字段）。
        expect(baseline!.computations.filter(item => item.stateGraph !== undefined).map(item => item.stateGraph)).toEqual([
            { nodeNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            { nodeNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        ]);
        await db.close();
    });

    test("legacy manifest without stateGraph degrades to no-comparison (no requirement noise)", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        // 模拟框架升级窗口：把已存 manifest 的 stateGraph 字段抹掉再写回，然后改名迁移。
        const controllerForRead = makeV2Controller(db, V1_SPEC, V1_SPEC);
        const stored = (await readMigrationManifest(controllerForRead))!;
        const legacy = {
            ...stored,
            computations: stored.computations.map(item => { const { stateGraph, ...rest } = item; void stateGraph; return rest; }),
        };
        await writeMigrationManifest(controllerForRead, legacy);

        const spec: MachineSpec = { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        const change = computationChange(diff, "property:StateGraphProbeTicket.status");
        expect(change.detected.stateGraphChanged).toBe(false);
        await db.close();
    });

    test("approveGeneratedMigrationDiff recognizes state-graph-mapping requirements", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        const spec: MachineSpec = { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const decision = approvedDiff.decisions.find(
            (entry): entry is Extract<typeof entry, { kind: "state-graph-mapping" }> =>
                entry.kind === "state-graph-mapping" && entry.dataContext === "property:StateGraphProbeTicket.status",
        );
        expect(decision).toBeDefined();
        expect(decision?.mapping).toEqual({ approved: "accepted" });
        expect(approvedDiff.decisions.filter(item => item.kind === "state-graph-mapping")).toHaveLength(2);
        await db.close();
    });

    test("migrate() fail-fasts on missing state-graph-mapping decision (dry-run included)", async () => {
        const db = new PGLiteDB();
        await setupV1(db);
        const spec: MachineSpec = { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" };
        const controllerV2 = makeV2Controller(db, spec, spec);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const withoutMapping = {
            ...approvedDiff,
            decisions: approvedDiff.decisions.filter(item => !(item.kind === "state-graph-mapping")),
        };
        await expect(controllerV2.migrate({ handlers: PROBE_EVENT_REBUILD_HANDLERS, approvedDiff: withoutMapping })).rejects.toThrow(/Missing migration decision for required review item: state-graph-mapping/);
        await expect(controllerV2.migrate({ handlers: PROBE_EVENT_REBUILD_HANDLERS, approvedDiff: withoutMapping, dryRun: true })).rejects.toThrow(/state-graph-mapping/);
        await db.close();
    });
});

// ---------------------------------------------------------------------------
// M-02 execution layer: mapping application + post-migration dispatch.
// ---------------------------------------------------------------------------

/**
 * 迁移后读取持久化 currentState 的唯一可信途径是 bound state 列本身（不是输出值——
 * 输出值可能被 event rebuild handler 改写，与状态无关）。列名由
 * Scheduler.getBoundStateName 固定为 `_${host}_${property}_bound_currentState`。
 */
function currentStateColumn(hostName: string, propertyName: string) {
    return `_${hostName}_${propertyName}_bound_currentState`;
}

const M2_STATUS_COLUMN = currentStateColumn("M2Ticket", "status");
const M2_GLOBAL_KEY = "_m2GlobalPhase_bound_currentState";

type ExecSpec = {
    stateNames: string[];
    initialStateName: string;
};

/** property 级 StateMachine：`M2Ticket.status`，转移由 Approve/Archive 交互触发。 */
function buildExecPropertyModel(spec: ExecSpec, transferThird: "twoStep" | "oneStep", computeTargetText: "base" | "stringWrap" = "base") {
    const [first, second, third] = spec.stateNames;
    const node = (name: string) => new StateNode({ name });
    const states = transferThird === "twoStep" ? [node(first), node(second), node(third)] : [node(first), node(second)];
    // computeTargetText：N3（M-04 宽口径）需要一个「无状态图变化、但函数文本变化」的迁移
    // 触发源——stringWrap 变体与 base 行为等价、编译后 JS 文本不同（注意 TS 的类型断言
    // 与非空断言会被转译擦除，必须改运行时行为面；functionTextChanged → possibly-changed
    // → changed 决策 → rebuildOutput=true、rebuildState=false）。
    const computeTarget = computeTargetText === "stringWrap"
        ? (event: any) => ({ id: String(event.record.payload!.ticketId) })
        : (event: any) => ({ id: event.record.payload!.ticketId });
    const transfers = [
        new StateTransfer({
            trigger: { recordName: InteractionEventEntity.name, type: "create", record: { interactionName: "M2ApproveTicket" } },
            current: node(first),
            next: node(second),
            computeTarget,
        }),
        ...(transferThird === "twoStep" ? [new StateTransfer({
            trigger: { recordName: InteractionEventEntity.name, type: "create", record: { interactionName: "M2ArchiveTicket" } },
            current: node(second),
            next: node(third),
            computeTarget: (event: any) => ({ id: event.record.payload!.ticketId }),
        })] : []),
    ];
    const machine = new StateMachine({ states, transfers, initialState: node(spec.initialStateName) });
    const Ticket = new Entity({
        name: "M2Ticket",
        properties: [
            new Property({ name: "title", type: "string" }),
            new Property({ name: "status", type: "string", computation: machine }),
        ],
    });
    return { Ticket, machine };
}

/** global 级 StateMachine：`m2GlobalPhase` 字典，转移由 Advance/Retreat 交互触发。 */
function buildExecGlobalModel(spec: ExecSpec) {
    const [first, second, third] = spec.stateNames;
    const node = (name: string) => new StateNode({ name });
    const machine = new StateMachine({
        states: [node(first), node(second), node(third)],
        transfers: [
            new StateTransfer({
                trigger: { recordName: InteractionEventEntity.name, type: "create", record: { interactionName: "M2AdvancePhase" } },
                current: node(first),
                next: node(second),
            }),
            new StateTransfer({
                trigger: { recordName: InteractionEventEntity.name, type: "create", record: { interactionName: "M2RetreatPhase" } },
                current: node(second),
                next: node(third),
            }),
        ],
        initialState: node(spec.initialStateName),
    });
    const dict = new Dictionary({ name: "m2GlobalPhase", type: "string", collection: false, computation: machine });
    return { dict, machine };
}

/** 交互在 V1/V2 两侧重声明为同形实例（payload 用 ticketId: string 避免跨 controller 引用实体）。 */
function buildExecInteractions() {
    // CAUTION 必须 Interaction.create（不能 new）：静态工厂才注入 event entity
    // （InteractionEventEntity）与 admission handler，new 出的实例不会把 _Interaction_
    // 注册进 storage schema，StateMachine 的 trigger 监听会因未知名被 setup 拒绝。
    const ticketPayload = () => Payload.create({
        items: [PayloadItem.create({ name: "ticketId", type: "string", required: true })],
    });
    return {
        approve: Interaction.create({ name: "M2ApproveTicket", action: Action.create({ name: "M2ApproveTicket" }), payload: ticketPayload() }),
        archive: Interaction.create({ name: "M2ArchiveTicket", action: Action.create({ name: "M2ArchiveTicket" }), payload: ticketPayload() }),
        advance: Interaction.create({ name: "M2AdvancePhase", action: Action.create({ name: "M2AdvancePhase" }) }),
        retreat: Interaction.create({ name: "M2RetreatPhase", action: Action.create({ name: "M2RetreatPhase" }) }),
    };
}

async function setupExecV1(db: PGLiteDB) {
    const { Ticket } = buildExecPropertyModel({ stateNames: ["pending", "approved", "archived"], initialStateName: "pending" }, "twoStep");
    const { dict } = buildExecGlobalModel({ stateNames: ["pending", "approved", "archived"], initialStateName: "pending" });
    const interactions = buildExecInteractions();
    const User = new Entity({ name: USER_ENTITY, properties: [new Property({ name: "name", type: "string" })] });
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system,
        entities: [Ticket, User],
        relations: [],
        dict: [dict],
        eventSources: Object.values(interactions),
    });
    await controller.setup(true);
    return { system, controller, interactions };
}

function makeExecV2Controller(
    db: PGLiteDB,
    propertySpec: ExecSpec,
    globalSpec: ExecSpec,
    transferThird: "twoStep" | "oneStep" = "twoStep",
    computeTargetText: "base" | "stringWrap" = "base",
) {
    const { Ticket } = buildExecPropertyModel(propertySpec, transferThird, computeTargetText);
    const { dict } = buildExecGlobalModel(globalSpec);
    const interactions = buildExecInteractions();
    const User = new Entity({ name: USER_ENTITY, properties: [new Property({ name: "name", type: "string" })] });
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system,
        entities: [Ticket, User],
        relations: [],
        dict: [dict],
        eventSources: Object.values(interactions),
    });
    return { controller, interactions };
}

/**
 * 迁移 + 返回读值助手（migrate 内部已完成 scheduler.setup(false)）。输出重建 handler
 * 按已映射的 currentState 推导输出值（设计 §3.1：handler 收到的 record 里 bound-state
 * 列已是新名——先施加映射再跑输出重建），迁移后 dispatch 检查转移是否真正生效。
 */
// event rebuild handler 的合约是 ({ controller, dataContext, record })（migration.ts
// runFullRecompute 的 property 分支），record 里 bound-state 列已被映射施加改写为新名。
function execEventRebuildHandlers(controller: Controller, overrides?: Record<string, (context: any) => unknown>) {
    const statusFromState = (context: { record?: Record<string, unknown> }) => context.record![M2_STATUS_COLUMN] ?? context.record!.status;
    return {
        eventRebuild: {
            "property:M2Ticket.status": overrides?.["property:M2Ticket.status"] ?? statusFromState,
            "global:m2GlobalPhase": overrides?.["global:m2GlobalPhase"] ?? (async () => {
                const value = await controller.system.storage.atomic.get<string>({ key: M2_GLOBAL_KEY, valueType: "string" });
                return value ?? "pending";
            }),
        },
    };
}

async function migrateExecTo(controller: Controller, options: {
    stateMappings?: Record<string, Record<string, string | null>>;
    eventRebuildValues?: Record<string, (record: any) => unknown>;
}) {
    const approvedDiff = await approveGeneratedMigrationDiff(controller, { stateMappings: options.stateMappings });
    await controller.migrate({
        approvedDiff,
        handlers: execEventRebuildHandlers(controller, options.eventRebuildValues),
    });
    return controller;
}

/** 读 M2Ticket 的输出值与持久化 currentState 列（stateMachine.spec.ts:1688 同款读法）。 */
async function readTicket(system: { storage: MonoSystem["storage"] }, ticketId: unknown) {
    return system.storage.findOne(
        "M2Ticket",
        MatchExp.atom({ key: "id", value: ["=", ticketId] }),
        undefined,
        ["*", M2_STATUS_COLUMN],
    )!;
}

/** 读全局 currentState 的持久化值（migration.spec.ts state-only 用例同款读法）。 */
async function readGlobalState(system: { storage: MonoSystem["storage"] }) {
    return system.storage.atomic.get<string>({ key: M2_GLOBAL_KEY, valueType: "string" });
}

describe("StateMachine state graph migration execution (M-02)", () => {
    test("mechanism B (non-initial rename): persisted currentState remapped, post-migration dispatch works (property + global)", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        // 一条记录停在 pending（未转移），一条推进到 approved。
        const pendingTicket = await system.storage.create("M2Ticket", { title: "stays-pending" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        await controllerV1.dispatch(interactions.advance, { user, payload: {} });
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        expect(await readGlobalState(system)).toBe("approved");

        // V2：approved -> accepted（非初始改名，rebuildState=false——映射必须由批准决策触发）。
        const { controller: controllerV2, interactions: v2Interactions } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
        );
        await migrateExecTo(controllerV2, {
            stateMappings: {
                "property:M2Ticket.status": { approved: "accepted" },
                "global:m2GlobalPhase": { approved: "accepted" },
            },
        });

        // 迁移后：输出值与 currentState 都应处于新图名下；未转移记录不受影响。
        const migratedApproved = await readTicket(controllerV2.system, approvedTicket.id);
        expect(migratedApproved[M2_STATUS_COLUMN]).toBe("accepted");
        expect(migratedApproved.status).toBe("accepted");
        const migratedPending = await readTicket(controllerV2.system, pendingTicket.id);
        expect(migratedPending[M2_STATUS_COLUMN]).toBe("pending");
        expect(await readGlobalState(controllerV2.system)).toBe("accepted");

        // 迁移后的下一次交互必须有效：accepted --archive--> archived（property）。
        const dispatchResult = await controllerV2.dispatch(v2Interactions.archive, { user, payload: { ticketId: approvedTicket.id } });
        expect(dispatchResult.error).toBeUndefined();
        const afterArchive = await readTicket(controllerV2.system, approvedTicket.id);
        expect(afterArchive[M2_STATUS_COLUMN]).toBe("archived");
        expect(afterArchive.status).toBe("archived");

        // global：accepted --retreat--> archived。
        const globalResult = await controllerV2.dispatch(v2Interactions.retreat, { user, payload: {} });
        expect(globalResult.error).toBeUndefined();
        expect(await readGlobalState(controllerV2.system)).toBe("archived");
        expect(await controllerV2.system.storage.dict.get("m2GlobalPhase")).toBe("archived");
        await db.close();
    });

    test("mechanism A (initial rename): both never-transitioned and transitioned records get mapped, dispatch works after migration", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const pendingTicket = await system.storage.create("M2Ticket", { title: "stays-pending" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        // global 停在 pending（不 advance）——审计轮 3 补强：global 字典承载旧初始名
        // pending，初始改名时它必须被映射为 queued（此前该子格只被 property 侧执行，
        // global 侧的旧初始名从未被任何用例持有）。
        expect(await readGlobalState(system)).toBe("pending");

        // V2：pending -> queued（初始态改名，rebuildState=rebuildOutput=true——机制 A 的
        // 双真组合此前会跳过状态重建）。
        const { controller: controllerV2, interactions: v2Interactions } = makeExecV2Controller(
            db,
            { stateNames: ["queued", "approved", "archived"], initialStateName: "queued" },
            { stateNames: ["queued", "approved", "archived"], initialStateName: "queued" },
        );
        await migrateExecTo(controllerV2, {
            stateMappings: {
                "property:M2Ticket.status": { pending: "queued" },
                "global:m2GlobalPhase": { pending: "queued" },
            },
        });

        // 未转移过的记录：currentState 从 pending 映射到 queued。
        expect((await readTicket(controllerV2.system, pendingTicket.id))[M2_STATUS_COLUMN]).toBe("queued");
        // 已转移到 approved 的记录：名字在新图中仍合法，不受映射影响（不是无差别重置）。
        expect((await readTicket(controllerV2.system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        // global 字典的旧初始名 pending 同样被映射为 queued（审计轮 3 补强的子格）。
        expect(await readGlobalState(controllerV2.system)).toBe("queued");
        expect(await controllerV2.system.storage.dict.get("m2GlobalPhase")).toBe("queued");

        // 迁移后：queued --approve--> approved 必须生效（A2 场景：改初始名后转移可用）。
        const dispatchResult = await controllerV2.dispatch(v2Interactions.approve, { user, payload: { ticketId: pendingTicket.id } });
        expect(dispatchResult.error).toBeUndefined();
        const afterApprove = await readTicket(controllerV2.system, pendingTicket.id);
        expect(afterApprove[M2_STATUS_COLUMN]).toBe("approved");
        expect(afterApprove.status).toBe("approved");
        await db.close();
    });

    test("mechanism G (state node removal): records on the removed state fall back per explicit mapping (null -> new initial)", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const archivedTicket = await system.storage.create("M2Ticket", { title: "was-archived" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: archivedTicket.id } });
        await controllerV1.dispatch(interactions.archive, { user, payload: { ticketId: archivedTicket.id } });
        expect((await readTicket(system, archivedTicket.id))[M2_STATUS_COLUMN]).toBe("archived");

        // V2：删除 archived 节点（两节点图，只有一个 transfer）。
        const { controller: controllerV2, interactions: v2Interactions } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "approved"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            "oneStep",
        );
        await migrateExecTo(controllerV2, {
            stateMappings: {
                // 显式降级决策：archived 记录回到新初始态 pending。
                "property:M2Ticket.status": { archived: null },
            },
        });

        expect((await readTicket(controllerV2.system, archivedTicket.id))[M2_STATUS_COLUMN]).toBe("pending");
        // 迁移后：pending --approve--> approved 必须生效。
        const dispatchResult = await controllerV2.dispatch(v2Interactions.approve, { user, payload: { ticketId: archivedTicket.id } });
        expect(dispatchResult.error).toBeUndefined();
        const afterApprove = await readTicket(controllerV2.system, archivedTicket.id);
        expect(afterApprove[M2_STATUS_COLUMN]).toBe("approved");
        expect(afterApprove.status).toBe("approved");
        await db.close();
    });

    test("mapping is per-record and intentional: an implementation that only rewrites the output value is distinguishable", async () => {
        // 输出 handler 谎报新名（只改输出值不改状态的错误实现形态），映射照常提供。
        // 状态列断言是映射施加的事实来源：若调度器只跑输出重建而不施加映射，本用例的
        // current_state 断言失败（仍为旧名）——这正是 M-02 验收要求的「可区分」判据。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });

        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
        );
        await migrateExecTo(controllerV2, {
            stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
            eventRebuildValues: { "property:M2Ticket.status": () => "accepted" },
        });

        const migrated = await readTicket(controllerV2.system, approvedTicket.id);
        // 状态列是映射施加的事实，不受 handler 谎报影响。
        expect(migrated[M2_STATUS_COLUMN]).toBe("accepted");
        expect(migrated.status).toBe("accepted");
        await db.close();
    });

    test("Custom computation with createState keeps its state semantics under migration (execution layer)", async () => {
        // Task 要求 6 的执行层枚举（d1 采纳评审注意事项 3）：Custom 带 createState 的
        // bound state 不进入 state-graph 机制——迁移走 state-only/changed 决策，state 由
        // rebuildStateDefaults 按新默认值重建（Custom 的状态语义由应用自决）。
        const db = new PGLiteDB();
        const buildCustom = (initial: number) => new Custom({
            name: "M2ExecCustom",
            createState: () => ({ tracker: new GlobalBoundState(initial) }),
            compute: async () => 1,
        });
        const dictV1 = new Dictionary({ name: "m2ExecCustomValue", type: "number", collection: false, computation: buildCustom(0) });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        await new Controller({ system: systemV1, entities: [], relations: [], dict: [dictV1] }).setup(true);
        expect(await systemV1.storage.atomic.get({ key: "_m2ExecCustomValue_bound_tracker", valueType: "number", defaultValue: 0 })).toBe(0);

        const dictV2 = new Dictionary({ name: "m2ExecCustomValue", type: "number", collection: false, computation: buildCustom(10) });
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [], relations: [], dict: [dictV2] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        expect(approvedDiff.decisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        await controllerV2.migrate({ approvedDiff });

        // state-only 路径按新默认值重建 bound state；输出值保持不变。
        expect(await systemV2.storage.atomic.get({ key: "_m2ExecCustomValue_bound_tracker", valueType: "number", defaultValue: 10 })).toBe(10);
        await db.close();
    });

    // -------------------------------------------------------------------------
    // D-1 回归（审计轮 2）：unchanged 计算决策 × 已批准 state-graph-mapping 的矛盾组合。
    // getChangedComputationsFromApprovedDiff 不为 unchanged 播种 rebuild 计划，调度器的
    // 映射分支只对计划内 computation 生效——该组合此前 migrate 成功但映射被静默丢弃，
    // currentState 停留旧名、后续 dispatch 静默无效（机制 B 经审批面复现）。修复：该组合
    // 在 validateApprovedDiff fail-fast（dryRun 同样触发），消除全部静默路径。
    // -------------------------------------------------------------------------

    test("D-1 regression: unchanged computation decision + approved state-graph-mapping is rejected (property level)", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");

        // V2：approved -> accepted（非初始改名）。审批面给出正确映射，但把 property 级
        // computation 决策改为 unchanged（approveGeneratedMigrationDiff 的合法选项）。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:M2Ticket.status:StateMachine": "unchanged",
            },
            stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
        });

        // 矛盾组合必须 fail-fast，而不是 migrate 成功后丢弃映射（dryRun 同样触发——
        // validateApprovedDiff 先于 dryRun 早退）。
        await expect(controllerV2.migrate({
            handlers: execEventRebuildHandlers(controllerV2),
            approvedDiff,
        })).rejects.toThrow(/contradicts the approved state graph mapping|state-graph-mapping/);
        await expect(controllerV2.migrate({
            handlers: execEventRebuildHandlers(controllerV2),
            approvedDiff,
            dryRun: true,
        })).rejects.toThrow(/contradicts the approved state graph mapping|state-graph-mapping/);

        // 审计轮 3 补强：unrebuildable 是同一矛盾面（同样不播种 rebuild 计划）。非 dryRun 下
        // blocking 兜底也会失败，但 dryRun 在 blocking 检查之前早退——若矛盾校验不含
        // unrebuildable，dryRun 会静默返回丢弃了映射的计划。断言特定错误信息以钉住该收口。
        const unrebuildableDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:M2Ticket.status:StateMachine": "unrebuildable",
            },
            stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
        });
        await expect(controllerV2.migrate({
            handlers: execEventRebuildHandlers(controllerV2),
            approvedDiff: unrebuildableDiff,
            dryRun: true,
        })).rejects.toThrow(/contradicts the approved state graph mapping/);
        await db.close();
    });

    test("D-1 regression: unchanged computation decision + approved state-graph-mapping is rejected (global level)", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        await controllerV1.dispatch(interactions.advance, { user, payload: {} });
        expect(await readGlobalState(system)).toBe("approved");

        // V2：global 侧 approved -> accepted，global computation 决策 unchanged。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:global:m2GlobalPhase:StateMachine": "unchanged",
            },
            stateMappings: { "global:m2GlobalPhase": { approved: "accepted" } },
        });

        await expect(controllerV2.migrate({
            handlers: execEventRebuildHandlers(controllerV2),
            approvedDiff,
        })).rejects.toThrow(/contradicts the approved state graph mapping|state-graph-mapping/);
        await db.close();
    });

    test("D-1 boundary: state-only computation decision keeps working with a state-graph-mapping (no over-rejection)", async () => {
        // 新增校验不得扩大拒绝面：state-only + mapping 是合法组合（映射施加、输出不动），
        // 审计轮 2 已实证其正确性，这里钉住该边界，防止未来把校验写成「有任何 mapping
        // 就要求 changed」。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });

        const { controller: controllerV2, interactions: v2Interactions } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:M2Ticket.status:StateMachine": "state-only",
            },
            stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
        });
        await controllerV2.migrate({
            approvedDiff,
            // state-only 不重建输出，但 handler 仍须存在（addMissingRebuildHandlerRequirements
            // 以计划为源；state-only 计划项 rebuildOutput=false，不要求 handler——提供它无害）。
            handlers: execEventRebuildHandlers(controllerV2),
        });

        // state-only + mapping：映射施加、输出不动（输出列仍是迁移前的字面值），随后
        // 转移按新图生效——正确组合不得被新校验拒绝。
        const migrated = await readTicket(controllerV2.system, approvedTicket.id);
        expect(migrated[M2_STATUS_COLUMN]).toBe("accepted");
        const dispatchResult = await controllerV2.dispatch(v2Interactions.archive, { user, payload: { ticketId: approvedTicket.id } });
        expect(dispatchResult.error).toBeUndefined();
        const afterArchive = await readTicket(controllerV2.system, approvedTicket.id);
        expect(afterArchive[M2_STATUS_COLUMN]).toBe("archived");
        await db.close();
    });
});

// ---------------------------------------------------------------------------
// M-03 state ownership & rebuildStateDefaults boundary (Task requirement 4).
// ---------------------------------------------------------------------------

/**
 * M-03 的计划制造手段是测试直调内部 API（recomputeChangedComputations + 手工 rebuild
 * 计划项），模拟的现实触发条件是「框架升级改变该 computation 的 bound-state 形状使
 * stateSignature 变化」——应用层声明今日触不到（Transform/聚合的 bound state 形状由
 * 框架固定），与设计期探针 D 同法。这条路径与真实 migrate() 共用同一 MigrationScheduler
 * 与同一写路径（recomputeChangedComputations 是 migrate 的重算入口）。
 */
describe("state ownership routing under migration (M-03)", () => {
    // bound state 列名由 Scheduler.getBoundStateName 按 computation 的 dataContext 派生：
    // Transform 的 dataContext 是 entity:M3Discount → _M3Discount_bound_*（列在输出表上）；
    // global Count 的 dataContext 是 global:m3OwnershipCount → 逐项状态列
    // _m3OwnershipCount_bound_isItemMatch（列在源记录表 M3CountItem 上）。
    const transformSourceKey = "_M3Discount_bound_sourceRecordId";
    const transformIndexKey = "_M3Discount_bound_transformIndex";
    const countItemStateKey = "_m3OwnershipCount_bound_isItemMatch";

    /** Transform（data-based）：Product → Discount（每个 price 一行输出）。 */
    async function setupTransformV1(db: PGLiteDB) {
        const Product = new Entity({
            name: "M3Product",
            properties: [new Property({ name: "price", type: "number" })],
        }, { uuid: "m3-ownership-product" });
        const transform = new Transform({
            record: Product,
            attributeQuery: ["id", "price"],
            callback: (item: any) => ({ discounted: item.price / 2 }),
        }, { uuid: "m3-ownership-transform" });
        const Discount = new Entity({
            name: "M3Discount",
            properties: [new Property({ name: "discounted", type: "number" })],
            computation: transform,
        }, { uuid: "m3-ownership-discount" });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Product, Discount], relations: [] });
        await controller.setup(true);
        await system.storage.create("M3Product", { price: 10 });
        await system.storage.create("M3Product", { price: 20 });
        return { system, controller };
    }

    /** 找到指定 computation 的 handle 与 manifest id（computationManifestId 同源）。 */
    function findComputation(controller: Controller, dataContext: string) {
        const handle = Array.from(controller.scheduler.computationsHandles.values())
            .find(item => item.dataContext.type + ":" + (item.dataContext as any).id.name === dataContext
                || (item.dataContext.type === "property" && `property:${(item.dataContext as any).host.name}.${(item.dataContext as any).id.name}` === dataContext));
        expect(handle).toBeDefined();
        return { handle: handle!, id: computationManifestId(handle as any) };
    }

    /** 直调重算入口，制造 rebuildState && rebuildOutput 的双真计划（探针 D 同法）。 */
    async function recomputeWithOwnershipPlan(controller: Controller, dataContext: string, rebuildState: boolean, rebuildOutput = true) {
        const { id } = findComputation(controller, dataContext);
        return recomputeChangedComputations(controller, [{
            computationId: id,
            dataContext,
            rebuildState,
            rebuildOutput,
            propagateOutputEvents: false,
            isSeed: true,
        }], {}, [], undefined);
    }

    test("Transform with rebuildState && rebuildOutput plan: no reset, output identical to full recompute (mechanism D)", async () => {
        const db = new PGLiteDB();
        const { system, controller } = await setupTransformV1(db);
        // 迁移前基线：两行输出，来源指针正确。
        const before = await system.storage.find("M3Discount", undefined, undefined, ["*", transformSourceKey, transformIndexKey]);
        expect(before).toHaveLength(2);

        // 双真计划：所有权路由必须让 rebuildStateDefaults 跳过 Transform 的
        // sourceRecordId/transformIndex（输出路径拥有的状态），否则唯一索引在 setInternal('')
        // 处崩溃（探针 D 的 fail-fast 形态）或行坍缩为重复行（无索引方言）。
        await recomputeWithOwnershipPlan(controller, "entity:M3Discount", true, true);

        const after = await system.storage.find("M3Discount", undefined, undefined, ["*", transformSourceKey, transformIndexKey]);
        // 行数与全量重算一致、无重复行（按 (sourceRecordId, transformIndex) 唯一键断言）。
        expect(after).toHaveLength(2);
        const keys = after.map(item => `${item[transformSourceKey]}:${item[transformIndexKey]}`);
        expect(new Set(keys).size).toBe(2);
        // 来源指针非空且回指现存的 M3Product 行（坍缩形态下 sourceRecordId 为 '' / 0）。
        const products = await system.storage.find("M3Product", undefined, undefined, ["id"]);
        const productIds = new Set(products.map(item => item.id));
        for (const row of after) {
            expect(productIds.has(row[transformSourceKey])).toBe(true);
            expect(row.discounted).toBeGreaterThanOrEqual(0);
        }
        // 输出值与全量重算一致：price/2 → {5, 10}。
        expect(after.map(item => item.discounted).sort((a, b) => a - b)).toEqual([5, 10]);
        await db.close();
    });

    test("Transform with state-only plan is a no-op: ownership routing must not depend on rebuildOutput", async () => {
        // 所有权 × rebuild 标志组合的收尾子格（实现审计轮 4 补强）：state-only 计划
        // （rebuildState=true, rebuildOutput=false）对 Transform 同样必须跳过重置——
        // 跳过不能以「随后的输出重算会重建这些列」为条件（没有重算时重置就是纯破坏：
        // 全部行坍缩到 ('' : 0) 同一键，唯一索引方言在 setInternal 处崩溃）。
        const db = new PGLiteDB();
        const { system, controller } = await setupTransformV1(db);
        const before = await system.storage.find("M3Discount", undefined, undefined, ["*", transformSourceKey, transformIndexKey]);
        expect(before).toHaveLength(2);

        await recomputeWithOwnershipPlan(controller, "entity:M3Discount", true, false);

        // no-op：行数、来源指针、输出值全部保持迁移前事实。
        const after = await system.storage.find("M3Discount", undefined, undefined, ["*", transformSourceKey, transformIndexKey]);
        expect(after).toHaveLength(2);
        const keys = after.map(item => `${item[transformSourceKey]}:${item[transformIndexKey]}`);
        expect(new Set(keys).size).toBe(2);
        for (const row of after) {
            expect(typeof row[transformSourceKey]).toBe("string");
            expect(row[transformSourceKey].length).toBeGreaterThan(0);
        }
        expect(after.map(item => item.discounted).sort((a, b) => a - b)).toEqual([5, 10]);
        await db.close();
    });

    test("aggregation with state-only plan keeps item state intact (ownership: output path owns state)", async () => {
        // 聚合家族的 item state 由输出路径拥有（compute/persistFullResult 重写它们）。
        // state-only 计划（rebuildState=true, rebuildOutput=false）按设计 §3.2 变为 no-op：
        // 不再把 item state 重置为默认值——旧行为依赖「下次全量重算纠正」的巧合。
        const db = new PGLiteDB();
        const Item = new Entity({
            name: "M3CountItem",
            properties: [new Property({ name: "score", type: "number" })],
        }, { uuid: "m3-ownership-count-item" });
        const count = new Count({
            record: Item,
            attributeQuery: ["id", "score"],
            callback: (item: any) => item.score > 0,
        }, { uuid: "m3-ownership-count" });
        const dict = new Dictionary({
            name: "m3OwnershipCount",
            type: "number",
            collection: false,
            computation: count,
        }, { uuid: "m3-ownership-count-dict" });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        await controller.setup(true);
        await system.storage.create("M3CountItem", { score: 1 });
        await system.storage.create("M3CountItem", { score: 5 });
        await system.storage.create("M3CountItem", { score: -1 });
        expect(await system.storage.dict.get("m3OwnershipCount")).toBe(2);

        // item state 列在迁移前是运行期事实（isItemMatch=true 的行保持 true）。
        const before = await system.storage.find("M3CountItem", undefined, undefined, ["*", countItemStateKey]);
        expect(before.filter(item => item[countItemStateKey] === true)).toHaveLength(2);

        // state-only 计划：所有权路由后不重置 item state（输出不动、状态不动）。
        await recomputeWithOwnershipPlan(controller, "global:m3OwnershipCount", true, false);

        const after = await system.storage.find("M3CountItem", undefined, undefined, ["*", countItemStateKey]);
        expect(after.filter(item => item[countItemStateKey] === true)).toHaveLength(2);
        // 输出值不动（state-only 语义）。
        expect(await system.storage.dict.get("m3OwnershipCount")).toBe(2);
        await db.close();
    });

    test("RealTime with state-only plan keeps recompute timestamps (ownership: output path owns state)", async () => {
        // RealTime 双 handle 的 ownsStateOnRebuild=true 在实现轮 4 落地但无测试覆盖
        // （实现审计轮 4 补强）。时间戳由 compute 每次以当前时间重写（输出路径拥有）；
        // 重置为默认值 null 会让时间驱动的重算调度丢失下一次触发点。计划制造手段与
        // 本组其它用例同法（测试直调 recomputeChangedComputations，模拟「框架升级改变
        // bound-state 形状使 stateSignature 变化」）。property 级是可判别子格：state-only
        // 重置会把宿主记录上的时间戳清成 null；所有权路由必须保持运行期事实。
        const db = new PGLiteDB();
        const clock = new RealTime({
            attributeQuery: ["id"],
            callback: (now: Expression) => now.subtract(now).add(1),
            nextRecomputeTime: () => 1000,
        }, { uuid: "m3-ownership-realtime-clock" });
        const Host = new Entity({
            name: "M3RealTimeHost",
            properties: [new Property({ name: "clockValue", type: "number", computation: clock })],
        }, { uuid: "m3-ownership-realtime-host" });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Host], relations: [] });
        await controller.setup(true);
        const host = await system.storage.create("M3RealTimeHost", {});
        // 运行期事实：触发一次 compute，时间戳为当前时间（非默认 null）。
        expect(await system.storage.findOne("M3RealTimeHost", MatchExp.atom({ key: "id", value: ["=", host.id] }), undefined, ["*"])!.then(r => r!.clockValue)).toBe(1);
        const lastKey = "_M3RealTimeHost_clockValue_bound_lastRecomputeTime";
        const before = await system.storage.findOne("M3RealTimeHost", MatchExp.atom({ key: "id", value: ["=", host.id] }), undefined, ["id", lastKey]);
        expect(before![lastKey]).not.toBeNull();

        // state-only 计划（rebuildState=true, rebuildOutput=false）：所有权路由后是 no-op，
        // 时间戳保持运行期事实（若路由误判为「可整体重置」，此处被清为 null）。
        await recomputeWithOwnershipPlan(controller, "property:M3RealTimeHost.clockValue", true, false);

        const after = await system.storage.findOne("M3RealTimeHost", MatchExp.atom({ key: "id", value: ["=", host.id] }), undefined, ["id", lastKey, "_M3RealTimeHost_clockValue_bound_nextRecomputeTime"]);
        expect(after![lastKey]).toBe(before![lastKey]);
        expect(after!._M3RealTimeHost_bound_nextRecomputeTime).not.toBeNull();
        await db.close();
    });

    test("Custom computation with createState keeps reset-to-default semantics (no ownership: state is application-owned)", async () => {
        // Custom 的 bound state 语义由应用自决，框架不解释其值域——重置为声明默认值仍是
        // 正确动作（M-02 的 Custom 执行层用例已覆盖真实迁移路径；这里直调路径同断言，
        // 钉住所有权路由不得把 Custom 也误判为「输出拥有」）。
        const db = new PGLiteDB();
        const custom = new Custom({
            name: "M3OwnershipCustom",
            createState: () => ({ tracker: new GlobalBoundState(10) }),
            compute: async () => 1,
        }, { uuid: "m3-ownership-custom" });
        const dict = new Dictionary({
            name: "m3OwnershipCustomValue",
            type: "number",
            collection: false,
            computation: custom,
        }, { uuid: "m3-ownership-custom-dict" });
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [], relations: [], dict: [dict] });
        await controller.setup(true);
        // 迁移前的运行期事实（非默认值）。
        await system.storage.atomic.replace({ key: "_m3OwnershipCustomValue_bound_tracker", valueType: "number", defaultValue: 10 }, 42);

        await recomputeWithOwnershipPlan(controller, "global:m3OwnershipCustomValue", true, false);

        // 重置为声明默认值 10（Custom 不被所有权机制接管）。
        expect(await system.storage.atomic.get({ key: "_m3OwnershipCustomValue_bound_tracker", valueType: "number", defaultValue: 10 })).toBe(10);
        await db.close();
    });
});

// ---------------------------------------------------------------------------
// M-04 persisted-state-name legality invariant (Task requirement 3).
// ---------------------------------------------------------------------------

/**
 * 迁移路径上的受检不变量：迁移触碰某个 StateMachine（rebuild 计划项存在——rebuildState
 * 或 rebuildOutput 任一为真）后，其每条宿主记录/全局字典的持久化 currentState 必须属于
 * 当前状态图的节点名集合，否则在重算事务内 fail-fast（错误含 dataContext、非法名与合法
 * 集合），而不是迁移成功、下一次交互静默 skip（机制 F 的迁移路径版本）。
 *
 * 宽口径（设计 §3.4）：扫描以「rebuild 计划项被触发」为准，不限于「状态图变化项」——
 * 这是升级窗口（旧 manifest 缺 stateGraph 字段、检测降级为不比较）的兜底。无 rebuild
 * 计划项的 StateMachine 不扫（成本边界），运行期防御所有非法写入不在辖区（探针 F 的
 * setup/dispatch 边界）。
 */
describe("persisted currentState legality invariant under migration (M-04)", () => {
    /** 升级窗口制造（M-01 同法）：把已存 manifest 的 stateGraph 字段抹掉再写回。 */
    async function stripStoredStateGraph(db: PGLiteDB) {
        const controllerForRead = makeExecV2Controller(db, { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" }, { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" });
        const stored = (await readMigrationManifest(controllerForRead.controller))!;
        const legacy = {
            ...stored,
            computations: stored.computations.map(item => { const { stateGraph, ...rest } = item; void stateGraph; return rest; }),
        };
        await writeMigrationManifest(controllerForRead.controller, legacy);
    }

    /** 探针 F 同法：直接把一条记录的持久化 currentState 写成图外名。 */
    async function corruptTicketState(system: { storage: MonoSystem["storage"] }, ticketId: unknown, value: string) {
        await system.storage.atomic.replace({ recordName: "M2Ticket", id: ticketId as string, field: M2_STATUS_COLUMN }, value);
    }

    test("N0: mapping value pointing outside the new graph rejects the migration before any data change", async () => {
        // 里程碑验收点名的负向（M-01 已在 diff 层覆盖同型非法目标；这里经完整 migrate() 入口
        // 钉住「迁移被拒、数据不动」）。非法目标在 validateApprovedDiff 被拒（早于任何事务）。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });

        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const poisoned = {
            ...approvedDiff,
            decisions: approvedDiff.decisions.map(item => item.kind === "state-graph-mapping" && item.dataContext === "property:M2Ticket.status"
                ? { ...item, mapping: { approved: "nonexistent" } }
                : item),
        };
        await expect(controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff: poisoned }))
            .rejects.toThrow(/outside the new state graph/);
        // 迁移被拒时数据不动（V1 侧读取同一 db）。
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        await db.close();
    });

    test("N1: upgrade window (legacy manifest without stateGraph) — illegal name fails migration instead of surviving silently (property level)", async () => {
        // 升级窗口 × 非初始改名：旧 manifest 缺 stateGraph → 检测降级为「不比较」→ 无映射要求
        // → 审批面放行。宽口径不变量必须在重算事务内发现 approved 不在新图
        // {pending, accepted, archived} 中并 fail-fast（今日行为：迁移成功、currentState 残留
        // 旧名、后续 dispatch 静默无效——红灯基线断言的就是它必须不再发生）。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        await stripStoredStateGraph(db);

        // 只改 property 侧图（global 侧保持原样，不进入本次断言）。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const diff = await controllerV2.generateMigrationDiff();
        // 前提自检：升级窗口内检测确实降级（无 state-graph-mapping 要求）——不变量是唯一防线。
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        expect(approvedDiff.decisions.some(item => item.kind === "state-graph-mapping")).toBe(false);

        // try/catch 断言（rejects 匹配器在意外成功形态下会序列化整个 MigrationPlan 报告）。
        let migrationError: unknown;
        try {
            await controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/property:M2Ticket\.status[\s\S]*approved[\s\S]*pending, accepted, archived/);
        // 事务回滚：迁移失败后数据保持迁移前事实。
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        await db.close();
    });

    test("N2: pre-corrupted out-of-graph name is caught after mapping application and the transaction rolls back", async () => {
        // 探针 F 的迁移路径版本：检测得到的改名 + 正确映射，但另一条记录的持久化 currentState
        // 被写成图外名 ghost（映射合同的键域覆盖不到它）。不变量在映射施加后、输出重建前扫描，
        // 必须发现 ghost；重算事务回滚，已施加的映射（approved→accepted）一并撤销。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        const ghostTicket = await system.storage.create("M2Ticket", { title: "corrupted" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        await corruptTicketState(system, ghostTicket.id, "ghost");
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");

        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        // CAUTION 不用 expect(...).rejects：迁移意外成功（红灯形态）时 vitest 会序列化完整
        // MigrationPlan 对象做 diff，schema/DDL 之大足以在失败报告中 OOM。try/catch 断言同样
        // 判别，且错误信息只含错误对象本身。
        let migrationError: unknown;
        try {
            await migrateExecTo(controllerV2, {
                stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
            });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/property:M2Ticket\.status[\s\S]*ghost[\s\S]*pending, accepted, archived/);

        // 重算事务回滚：approved 记录的映射写与 ghost 记录都保持迁移前事实。
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        await db.close();
    });

    test("N3: wide scope — scan fires on rebuildOutput alone (no state graph change at all)", async () => {
        // 宽口径边界：无任何状态图变化（仅 computeTarget 函数文本变化 → changed 计划，
        // rebuildState=false、rebuildOutput=true）时扫描同样触发。收窄到「状态图变化项」的
        // 错误实现会放过本格（升级窗口兜底的一部分）。
        const db = new PGLiteDB();
        const { system, controller: controllerV1 } = await setupExecV1(db);
        const ghostTicket = await system.storage.create("M2Ticket", { title: "corrupted" });
        await corruptTicketState(system, ghostTicket.id, "ghost");

        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            "twoStep",
            "stringWrap",
        );
        const diff = await controllerV2.generateMigrationDiff();
        // 前提自检：本迁移确实没有任何状态图变化与映射要求。
        expect(diff.changes.some(item => item.kind === "computation" && item.detected.stateGraphChanged)).toBe(false);
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        let migrationError: unknown;
        try {
            await controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/property:M2Ticket\.status[\s\S]*ghost[\s\S]*pending, approved, archived/);
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        await db.close();
    });

    test("N4: upgrade window at global scope — illegal global currentState fails migration", async () => {
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        await controllerV1.dispatch(interactions.advance, { user, payload: {} });
        expect(await readGlobalState(system)).toBe("approved");
        await stripStoredStateGraph(db);

        // 只改 global 侧图；property 侧记录全部停在合法名 pending。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        expect(approvedDiff.decisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        let migrationError: unknown;
        try {
            await controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/global:m2GlobalPhase[\s\S]*approved[\s\S]*pending, accepted, archived/);
        expect(await readGlobalState(system)).toBe("approved");
        await db.close();
    });

    test("N6 (D-2): state-only plan item is also scanned — mapping applies, ghost record fails the migration in-transaction", async () => {
        // 审计轮 5 实现缺陷 D-2 的回归：state-only 计划项（rebuildState=true,
        // rebuildOutput=false）在 run() 的 `if (!item.rebuildOutput) continue` 处跳出循环，
        // 宽口径扫描对它不可达——宽口径的 rebuildState 单真半边（设计 §3.4）。
        // 组合面是 D-1 boundary 钉住的合法审批组合（state-only + mapping），路径真实可达。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const approvedTicket = await system.storage.create("M2Ticket", { title: "was-approved" });
        const ghostTicket = await system.storage.create("M2Ticket", { title: "corrupted" });
        await controllerV1.dispatch(interactions.approve, { user, payload: { ticketId: approvedTicket.id } });
        await corruptTicketState(system, ghostTicket.id, "ghost");
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");

        // V2：approved -> accepted，computation 决策 state-only + 正确映射（D-1 boundary 同款
        // 合法组合）。ghost 是映射键域之外的图外名——扫描必须在重算事务内发现它。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:M2Ticket.status:StateMachine": "state-only",
            },
            stateMappings: { "property:M2Ticket.status": { approved: "accepted" } },
        });
        // CAUTION 不用 expect(...).rejects：迁移意外成功（红灯形态）时 vitest 会序列化完整
        // MigrationPlan 对象做 diff，足以在失败报告中 OOM（实现轮 5 实测）。
        let migrationError: unknown;
        try {
            await controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/property:M2Ticket\.status[\s\S]*ghost[\s\S]*pending, accepted, archived/);

        // 事务回滚：映射写（approved→accepted）与 ghost 记录都保持迁移前事实。
        expect((await readTicket(system, approvedTicket.id))[M2_STATUS_COLUMN]).toBe("approved");
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        await db.close();
    });

    test("N7 (D-2): state-only plan item without a mapping decision (upgrade window) is also scanned before the default reset", async () => {
        // D-2 的升级窗口变体：旧 manifest 缺 stateGraph → 检测降级为不比较 → 无映射要求 →
        // state-only 决策批准后，状态重建走 rebuildStateDefaults（StateMachine 不被所有权
        // 路由接管、无映射决策）。其 defaultValue 是新初始态名——重置发生在扫描之后会把
        // 图外名「洗白」成合法名（洗白不是映射：ghost 记录的事实被无差别覆盖）。因此扫描
        // 必须在重置之前执行：ghost 在被改写前即被拦截，迁移事务回滚。
        const db = new PGLiteDB();
        const { system, controller: controllerV1 } = await setupExecV1(db);
        const ghostTicket = await system.storage.create("M2Ticket", { title: "corrupted" });
        await corruptTicketState(system, ghostTicket.id, "ghost");
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        await stripStoredStateGraph(db);

        // V2 property 侧 approved -> accepted（非初始改名）。升级窗口内无 state-graph-mapping
        // 要求；computation 决策取 state-only（本格的 rebuildState=true、rebuildOutput=false）。
        const { controller: controllerV2 } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
        );
        const diff = await controllerV2.generateMigrationDiff();
        expect(diff.requiredDecisions.some(item => item.kind === "state-graph-mapping")).toBe(false);
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2, {
            computationDecisions: {
                "computation:property:M2Ticket.status:StateMachine": "state-only",
            },
        });
        let migrationError: unknown;
        try {
            await controllerV2.migrate({ handlers: execEventRebuildHandlers(controllerV2), approvedDiff });
        } catch (error) {
            migrationError = error;
        }
        expect(migrationError).toBeInstanceOf(Error);
        expect(String(migrationError)).toMatch(/property:M2Ticket\.status[\s\S]*ghost[\s\S]*pending, accepted, archived/);
        // 事务回滚：ghost 记录保持迁移前事实（没有被 rebuildStateDefaults 洗白为新初始态）。
        expect((await readTicket(system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        await db.close();
    });

    test("P5: cost boundary — StateMachine with no rebuild plan item is not scanned and does not block migration", async () => {
        // 成本边界（设计 §3.4）：扫描以 rebuild 计划项为触发面。property 侧记录被腐蚀为
        // ghost，但本次迁移只触碰 global 侧（改名 + 映射，值合法）——property 计算不在
        // rebuild 计划里，不得被扫描、不得阻塞迁移，ghost 保持原值（运行期防御非法写入
        // 不在迁移不变量的辖区）。
        const db = new PGLiteDB();
        const { system, controller: controllerV1, interactions } = await setupExecV1(db);
        const user = await system.storage.create(USER_ENTITY, { name: "u1" });
        const ghostTicket = await system.storage.create("M2Ticket", { title: "corrupted" });
        await controllerV1.dispatch(interactions.advance, { user, payload: {} });
        await corruptTicketState(system, ghostTicket.id, "ghost");

        const { controller: controllerV2, interactions: v2Interactions } = makeExecV2Controller(
            db,
            { stateNames: ["pending", "approved", "archived"], initialStateName: "pending" },
            { stateNames: ["pending", "accepted", "archived"], initialStateName: "pending" },
        );
        await migrateExecTo(controllerV2, {
            stateMappings: { "global:m2GlobalPhase": { approved: "accepted" } },
        });

        // global 侧迁移完成且合法；property 侧未被触碰也未被扫描。
        expect(await readGlobalState(controllerV2.system)).toBe("accepted");
        expect((await readTicket(controllerV2.system, ghostTicket.id))[M2_STATUS_COLUMN]).toBe("ghost");
        // 迁移后的下一次交互对 global 侧生效（accepted --retreat--> archived）。
        const dispatchResult = await controllerV2.dispatch(v2Interactions.retreat, { user, payload: {} });
        expect(dispatchResult.error).toBeUndefined();
        expect(await readGlobalState(controllerV2.system)).toBe("archived");
        await db.close();
    });
});
