/**
 * 统一声明期校验（r16 建议 4，r26 落地）：static.public 里声明的 required / options /
 * constraints 由本 helper 在每个 Klass 的 create() 里统一执行。
 *
 * 背景：这些元数据此前只用于序列化/文档，"声明了约束 ⇒ 约束被执行"不是系统不变量——
 * 每个新声明面都会重新制造「声明期静默接受、setup/dispatch 深处才炸」的缺口
 * （r25 I-4 merged 守卫、r26 I-2 UniqueConstraint、r26 I-3 BoolExpressionData 同族）。
 *
 * 契约（刻意保持最小，遵循显式控制原则）：
 * - required: true 且无 defaultValue → args[field] 不得为 undefined；
 * - options: [...] → 值（或缺省时的 defaultValue()）必须 ∈ options；
 * - constraints: { name: predicate } → predicate(args) 必须返回真值（谓词收到完整 args）。
 * 不做深层类型校验（instanceType/type 形状由 TS 与运行期消费方负责）。
 */

export type PublicFieldDef = {
  required?: boolean
  collection?: boolean
  defaultValue?: () => unknown
  options?: readonly unknown[]
  constraints?: Record<string, (args: never) => unknown>
}

/**
 * 聚合计算（Count/Every/Any/Summation/Average/WeightedSummation）的目标声明校验：
 * record（global：聚合的目标集合）与 property（property-level：宿主上的关系属性）二选一。
 *
 * CAUTION 两者同给不是合法叠加：运行期（aggregationTemplate）property 分支优先，record
 * 被**静默忽略**——声明者以为在聚合 record 指定的集合，实际绑定到了宿主的 property 关系，
 * 产出错误数字且零告警。矛盾声明必须在声明期拒绝（显式控制）。
 */
export function validateAggregationTarget(
  klassName: string,
  args: { record?: unknown, property?: unknown },
): void {
  if (!args.record && !args.property) {
    throw new Error(`${klassName}.create() requires either "record" (target entity/relation) or "property" (host relation property).`)
  }
  if (args.record && args.property) {
    throw new Error(
      `${klassName}.create() got both "record" and "property" — they are mutually exclusive targets. ` +
      `At runtime "property" would win and "record" would be silently ignored (wrong aggregation with no warning). ` +
      `Use "record" for global aggregation over an entity/relation, or "property" for a host-level relation aggregation.`
    )
  }
}

export function validateCreateArgs(
  klassName: string,
  publicDef: Record<string, PublicFieldDef>,
  args: Record<string, unknown>,
): void {
  for (const [field, def] of Object.entries(publicDef)) {
    const value = args[field]
    if (value === undefined) {
      if (def.required === true && def.defaultValue === undefined) {
        throw new Error(`${klassName}.create() requires "${field}" (declared required in ${klassName}.public).`)
      }
      // 可选字段缺席时不跑 options/constraints（谓词普遍假设字段在场）。
      continue
    }
    if (def.options && !def.options.includes(value)) {
      throw new Error(
        `${klassName}.create() got invalid "${field}": ${JSON.stringify(value)}. ` +
        `Supported values: ${def.options.map(option => JSON.stringify(option)).join(', ')}.`
      )
    }
    if (def.constraints) {
      for (const [constraintName, predicate] of Object.entries(def.constraints)) {
        let passed: unknown
        try {
          passed = (predicate as (a: Record<string, unknown>) => unknown)(args)
        } catch (error) {
          throw new Error(
            `${klassName}.create() constraint "${field}.${constraintName}" threw while validating: ` +
            `${error instanceof Error ? error.message : String(error)}`
          )
        }
        if (!passed) {
          throw new Error(`${klassName}.create() violates constraint "${field}.${constraintName}".`)
        }
      }
    }
  }
}
