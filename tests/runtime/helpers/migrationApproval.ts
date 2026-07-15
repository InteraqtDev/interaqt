/**
 * 迁移审批测试助手（从 migration.spec.ts 抽取的唯一实现，r29）：
 * 生成 diff → 按推荐决策批准全部 requiredDecisions → migrate。
 * migration.spec 与迁移生成式 fuzzer（migrationGenerativeFuzz.spec.ts）共用。
 */
import { Controller } from "interaqt";

export async function approveGeneratedMigrationDiff(controller: Controller, options: {
    includeFunctionText?: boolean;
    includeDestructiveScope?: boolean;
    eventHandlers?: Record<string, string>;
    asyncHandlers?: Record<string, string>;
    computationDecisions?: Record<string, "changed" | "unchanged" | "state-only" | "unrebuildable">;
} = {}) {
    const diff = await controller.generateMigrationDiff({
        includeFunctionText: options.includeFunctionText ?? true,
        includeDestructiveScope: options.includeDestructiveScope ?? true,
    });
    const decisions = [
        ...diff.decisions,
        ...diff.requiredDecisions.map(requirement => {
            if (requirement.kind === "computation") {
                return {
                    kind: "computation" as const,
                    id: requirement.id,
                    dataContext: requirement.dataContext,
                    decision: options.computationDecisions?.[requirement.id] || requirement.recommendedDecision,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "event-rebuild-handler") {
                return {
                    kind: "event-rebuild-handler" as const,
                    dataContext: requirement.dataContext,
                    handlerRef: options.eventHandlers?.[requirement.dataContext] || requirement.dataContext,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "async-completion-handler") {
                return {
                    kind: "async-completion-handler" as const,
                    dataContext: requirement.dataContext,
                    handlerRef: options.asyncHandlers?.[requirement.dataContext] || requirement.dataContext,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "computation-takeover") {
                return {
                    kind: "computation-takeover" as const,
                    dataContext: requirement.dataContext,
                    computationId: requirement.computationId,
                    targetType: requirement.targetType,
                    previousAuthority: requirement.previousAuthority,
                    nextAuthority: requirement.nextAuthority,
                    oldDataStrategy: requirement.oldDataStrategy,
                    expectedExistingCount: requirement.expectedExistingCount,
                    expectedHostCount: requirement.expectedHostCount,
                    destructiveScopeRef: requirement.destructiveScopeRef,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "empty-fact-record-removal") {
                return {
                    kind: "empty-fact-record-removal" as const,
                    recordName: requirement.recordName,
                    tableName: requirement.tableName,
                    expectedCount: requirement.expectedCount,
                    reason: "approved by migration test",
                };
            }
            if (requirement.kind === "scoped-sequence-seed" || requirement.kind === "scoped-sequence-no-seed") {
                return {
                    ...requirement,
                    reason: "approved by migration test",
                };
            }
            return {
                kind: "destructive-scope" as const,
                dataContext: requirement.dataContext,
                recordName: requirement.recordName,
                ids: requirement.ids,
                reason: "approved by migration test",
            };
        }),
    ];
    return {
        ...diff,
        status: "approved" as const,
        decisions,
    };
}

export async function migrateWithApproval(controller: Controller, options: Parameters<Controller["migrate"]>[0] = {}) {
    const approvedDiff = options.approvedDiff || await approveGeneratedMigrationDiff(controller);
    return controller.migrate({ ...options, approvedDiff });
}

export async function dryRunWithApproval(controller: Controller, options: Parameters<Controller["migrate"]>[0] = {}) {
    return migrateWithApproval(controller, { ...options, dryRun: true });
}
