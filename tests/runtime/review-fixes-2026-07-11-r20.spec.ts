/**
 * r20 深度审查回归（runtime 面）。
 *
 * F-5 —— StateMachine trigger.record 在 update 事件上按部分 record 匹配：
 *   update 事件的 record 只携带本次实际写入的字段（changed keys + id），完整当前状态是
 *   {...oldRecord, ...record}。eventDep 匹配器（shouldTriggerEventBasedComputation）早已
 *   实现合并语义，StateMachine 的 TransitionFinder 是同一声明面（RecordMutationEventPattern）
 *   的分裂读者：trigger.record 里的字段只要不在本次 update 的 payload 里就静默不触发——
 *   与文档语义（"record 形态匹配即触发"）和 eventDep 轨道行为分裂。修复：两个读者共用
 *   mergedMutationEventView（合并视图），「本次更新触及字段 X」用 keys:['X'] 表达。
 *
 * F-2e —— 行内（merged link）写路径的 filtered relation 视图事件缺失的计算面证明：
 *   Count over filtered relation 在 host-create-with-ref / 同 id `&` 原地翻转 / host 删除
 *   三种行内写法下永久陈旧（storage 面见 tests/storage/review-fixes-2026-07-11-r20.spec.ts）。
 */
import { describe, expect, test } from "vitest";
import {
  Controller, MonoSystem, KlassByName,
  Entity, Property, Relation, Count,
  StateMachine, StateNode, StateTransfer, Transform, InteractionEventEntity,
} from "interaqt";
import { MatchExp } from "@storage";
import { PGLiteDB } from "@drivers";

describe("r20 F-5 — StateMachine trigger.record merges current state on update events", () => {
  async function setupPost() {
    const draftState = StateNode.create({ name: "draft" });
    const archivedState = StateNode.create({ name: "archived" });

    const Post = Entity.create({
      name: "Post",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "status", type: "string" }),
        Property.create({
          name: "phase",
          type: "string",
          computation: StateMachine.create({
            states: [draftState, archivedState],
            initialState: draftState,
            transfers: [
              StateTransfer.create({
                current: draftState,
                next: archivedState,
                trigger: {
                  recordName: "Post",
                  type: "update",
                  // record 模式 = 合并后的当前状态形态（与 eventDep 匹配器同一语义）
                  record: { status: "published" },
                },
                computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
              }),
            ],
          }),
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Post], relations: [], eventSources: [], ignoreGuard: true });
    await controller.setup(true);
    return { system };
  }

  test("update touching an unrelated field fires when merged state matches trigger.record", async () => {
    const { system } = await setupPost();
    const post = await system.storage.create("Post", { title: "t", status: "published" });
    // 本次 update 只写 title；record 里没有 status，但合并后的当前状态 status === 'published'
    await system.storage.update("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), { title: "t2" });

    const updated = await system.storage.findOne("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), undefined, ["*"]);
    expect(updated.phase).toBe("archived");
  });

  test("update does NOT fire when merged state does not match trigger.record", async () => {
    const { system } = await setupPost();
    const post = await system.storage.create("Post", { title: "t", status: "draft" });
    await system.storage.update("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), { title: "t2" });

    const updated = await system.storage.findOne("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), undefined, ["*"]);
    expect(updated.phase).toBe("draft");
  });

  test("update that sets the matched field itself still fires (previous behavior preserved)", async () => {
    const { system } = await setupPost();
    const post = await system.storage.create("Post", { title: "t", status: "draft" });
    await system.storage.update("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), { status: "published" });

    const updated = await system.storage.findOne("Post", MatchExp.atom({ key: "id", value: ["=", post.id] }), undefined, ["*"]);
    expect(updated.phase).toBe("archived");
  });

  test("keys + record combination still expresses 'this update touched X'", async () => {
    const draftState = StateNode.create({ name: "draft" });
    const doneState = StateNode.create({ name: "done" });
    const Task = Entity.create({
      name: "Task",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "status", type: "string" }),
        Property.create({
          name: "phase",
          type: "string",
          computation: StateMachine.create({
            states: [draftState, doneState],
            initialState: draftState,
            transfers: [
              StateTransfer.create({
                current: draftState,
                next: doneState,
                trigger: {
                  recordName: "Task",
                  type: "update",
                  keys: ["status"],
                  record: { status: "closed" },
                },
                computeTarget: (event: any) => ({ id: event.oldRecord?.id ?? event.record?.id }),
              }),
            ],
          }),
        }),
      ],
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Task], relations: [], eventSources: [], ignoreGuard: true });
    await controller.setup(true);

    const task = await system.storage.create("Task", { title: "t", status: "closed" });
    // keys 限定：只更新 title 不触发（status 未被本次更新触及）
    await system.storage.update("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), { title: "t2" });
    let current = await system.storage.findOne("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), undefined, ["*"]);
    expect(current.phase).toBe("draft");
    // 触及 status 且值匹配 → 触发
    await system.storage.update("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), { status: "closed" });
    current = await system.storage.findOne("Task", MatchExp.atom({ key: "id", value: ["=", task.id] }), undefined, ["*"]);
    expect(current.phase).toBe("done");
  });

  test("Transform eventDeps record pattern behaves identically (same declaration surface)", async () => {
    const Doc = Entity.create({
      name: "Doc",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "status", type: "string" }),
      ],
    });
    const AuditLog = Entity.create({
      name: "AuditLog",
      properties: [Property.create({ name: "note", type: "string" })],
      computation: Transform.create({
        eventDeps: {
          publishedDocTouched: { recordName: "Doc", type: "update", record: { status: "published" } },
        },
        callback: (event: any) => ({ note: `touched:${event.record?.title ?? ""}` }),
      }),
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Doc, AuditLog], relations: [], eventSources: [], ignoreGuard: true });
    await controller.setup(true);

    const doc = await system.storage.create("Doc", { title: "d", status: "published" });
    await system.storage.update("Doc", MatchExp.atom({ key: "id", value: ["=", doc.id] }), { title: "d2" });
    const logs = await system.storage.find("AuditLog", undefined, undefined, ["*"]);
    // eventDep 轨道（合并语义）触发——StateMachine trigger 现在与之同构
    expect(logs.length).toBe(1);
  });
});

describe("r20 F-2e — reactive computations over filtered relations stay fresh through in-row writes", () => {
  async function setupCounted() {
    const User = Entity.create({ name: "User", properties: [Property.create({ name: "name", type: "string" })] });
    const Team = Entity.create({
      name: "Team",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    // n:1 → merged link（FK 在 User 行上）：所有经宿主的写法都是行内写
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
    Team.properties.push(Property.create({
      name: "primaryMemberCount",
      type: "number",
      computation: Count.create({ property: "primaryMembers" }),
    }));

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [User, Team], relations: [userTeam, PrimaryUserTeam], eventSources: [], ignoreGuard: true });
    await controller.setup(true);
    return { system };
  }

  test("Count over filtered relation follows in-row create / flip / delete", async () => {
    const { system } = await setupCounted();
    const team = await system.storage.create("Team", { name: "T1" });

    // 1. host create with ref（行内 link create）
    const u1 = await system.storage.create("User", { name: "u1", team: { id: team.id, "&": { isPrimary: true } } });
    let t = await system.storage.findOne("Team", MatchExp.atom({ key: "id", value: ["=", team.id] }), undefined, ["*"]);
    expect(t.primaryMemberCount).toBe(1);

    // 2. 同 id `&` 原地翻转（行内 link update → 成员资格 exit）
    await system.storage.update("User", MatchExp.atom({ key: "id", value: ["=", u1.id] }), { team: { id: team.id, "&": { isPrimary: false } } });
    t = await system.storage.findOne("Team", MatchExp.atom({ key: "id", value: ["=", team.id] }), undefined, ["*"]);
    expect(t.primaryMemberCount).toBe(0);

    // 3. 翻回（enter）
    await system.storage.update("User", MatchExp.atom({ key: "id", value: ["=", u1.id] }), { team: { id: team.id, "&": { isPrimary: true } } });
    t = await system.storage.findOne("Team", MatchExp.atom({ key: "id", value: ["=", team.id] }), undefined, ["*"]);
    expect(t.primaryMemberCount).toBe(1);

    // 4. host 删除（行内 link 随行消失）
    await system.storage.delete("User", MatchExp.atom({ key: "id", value: ["=", u1.id] }));
    t = await system.storage.findOne("Team", MatchExp.atom({ key: "id", value: ["=", team.id] }), undefined, ["*"]);
    expect(t.primaryMemberCount).toBe(0);
  });
});
