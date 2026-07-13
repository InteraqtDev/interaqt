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
