import type { PropertyInstance } from './Property.js';

// 内部共享守卫（不进入公共导出面——index.ts 不 re-export 本文件）。
// 保留名与 storage 的 ID_ATTR('id')/ROW_ID_ATTR('_rowId') 对应（core 不能反向依赖
// runtime/storage，故用字面量）；relation 额外保留 'source'/'target'（端点虚拟链接属性）。
// 用户声明的同名属性会在 schema 编译时被框架列静默覆盖（含 defaultValue/computation）；
// 重复属性名会静默保留最后一个而计算句柄全部注册（争用一列）。二者都是零告警损坏，
// 声明期直接拒绝。storage 的 DBSetup.validatePropertyNames 是同一守卫的兜底
// （覆盖 create 之后 push 的属性、直接 new 构造等旁路）。
export function validatePropertyNamesOnCreate(
  ownerName: string | undefined,
  properties: PropertyInstance[] | undefined,
  kind: 'Entity' | 'Relation'
) {
  const reserved = kind === 'Relation' ? ['id', '_rowId', 'source', 'target'] : ['id', '_rowId'];
  const seen = new Set<string>();
  for (const property of (properties || [])) {
    if (reserved.includes(property.name)) {
      throw new Error(
        `Property name "${property.name}" on ${kind.toLowerCase()} "${ownerName}" is reserved. ` +
        (property.name === 'id' || property.name === '_rowId'
          ? `The framework manages the "${property.name}" column and would silently overwrite your declaration (including any defaultValue/computation on it). Use a different name, e.g. "externalId".`
          : `"source"/"target" are the relation's endpoint attributes. Use a different name for the relation property.`)
      );
    }
    if (seen.has(property.name)) {
      throw new Error(
        `Duplicate property name "${property.name}" on ${kind.toLowerCase()} "${ownerName}". ` +
        `Property names must be unique per record — duplicates silently keep only the last declaration while all their computations stay registered against one column.`
      );
    }
    seen.add(property.name);
  }
}
