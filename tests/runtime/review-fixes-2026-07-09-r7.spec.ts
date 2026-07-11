/**
 * Regression tests for the 2026-07-09 r7 deep review fixes.
 * See agentspace/output/deep-review-2026-07-09-r7.md
 *
 * - F-1: symmetric n:n entity deletion also removes links where the entity is on
 *        the target side (no orphan link, symmetric Count stays correct).
 * - F-2: symmetric n:n update-replace unlinks old links regardless of source/target side.
 * - F-3: dataPolicy.modifier limit cannot be bypassed by caller-supplied offset/orderBy.
 * - F-5: 'program' ActivityGroup (no completion semantics) is rejected at build time
 *        instead of silently dead-locking the activity.
 *
 * Note: `dataPolicy.match` returning null/undefined is by-design "no additional filter"
 * (see queryDataInteraction.spec.ts "should handle function returning null/undefined"),
 * so it is intentionally NOT treated as a bug here.
 */
import { describe, expect, test } from "vitest";
import {
    Entity, Property, Relation, Controller, MonoSystem, MatchExp, Count,
    Interaction, Action, GetAction, DataPolicy, Activity, ActivityGroup, Transfer, ActivityManager,
} from 'interaqt';
import { PGLiteDB } from '@drivers';
import type { RecordMutationEvent } from 'interaqt';

describe('review fixes 2026-07-09 r7', () => {

    // r7-F-1（对称删除漏 target 侧）与 r7-F-2（对称 update replace 漏侧）的点状回归已并入
    // 系统性矩阵（r17 测试整并）：referentialIntegrityMatrix.spec.ts（同 fixture + INV-1/INV-2 +
    // 事件完备性预言机，断言严格更强）与 symmetricAggregationMatrix.spec.ts（record-fallback
    // Count 经实体删除的计算面）。此处只保留矩阵未覆盖的 F-3 / F-5。

    // ============ F-3: dataPolicy.modifier offset bypass ============
    test('F-3: caller cannot paginate around a dataPolicy.modifier limit via offset', async () => {
        const Secret = Entity.create({ name: 'Secret', properties: [Property.create({ name: 'title', type: 'string' })] });
        const GetSecrets = Interaction.create({
            name: 'GetSecrets', action: GetAction, data: Secret,
            dataPolicy: DataPolicy.create({ modifier: { limit: 3 } })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Secret], relations: [], eventSources: [GetSecrets] });
        await controller.setup(true);
        for (let i = 0; i < 10; i++) await system.storage.create('Secret', { title: `s${i}` });

        const seen = new Set<string>();
        let lastError: any = null;
        for (let page = 0; page < 4; page++) {
            const res = await controller.dispatch(GetSecrets, { user: { id: 'u1' } as any, query: { attributeQuery: ['id', 'title'], modifier: { offset: page * 3 } } } as any);
            if (res.error) { lastError = res.error; break; }
            for (const r of (res.data as any[]) || []) seen.add(r.id);
        }
        // caller adding offset (not declared by policy) is rejected
        expect(lastError).toBeDefined();
        expect(String((lastError as any).message ?? lastError)).toContain('modifier');
        expect(seen.size).toBeLessThanOrEqual(3);
    });

    // ============ F-5: 'program' ActivityGroup rejected at build time ============
    test("F-5: 'program' ActivityGroup is rejected with a clear error instead of dead-locking", () => {
        const head = Interaction.create({ name: 'ProgHead', action: Action.create({ name: 'progHead' }) });
        const stepA = Interaction.create({ name: 'ProgStepA', action: Action.create({ name: 'progStepA' }) });
        const after = Interaction.create({ name: 'ProgAfter', action: Action.create({ name: 'progAfter' }) });
        const group = ActivityGroup.create({
            type: 'program',
            activities: [Activity.create({ name: 'progSeqA', interactions: [stepA] })]
        });
        const act = Activity.create({
            name: 'ProgFlow', interactions: [head, after], groups: [group],
            transfers: [
                Transfer.create({ name: 'pt1', source: head, target: group }),
                Transfer.create({ name: 'pt2', source: group, target: after }),
            ]
        });
        expect(() => new ActivityManager([act])).toThrow(/program.*not supported|not supported.*program/);
    });
});
