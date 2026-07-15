import {EntityToTableMap} from "./EntityToTableMap.js";
import {RecordQueryTree} from "./RecordQuery.js";

export type ModifierData = {
    orderBy?: {
        [k: string]: 'ASC'|'DESC'
    },
    limit?: number,
    offset?: number
}

export class Modifier {
    constructor(public recordName: string, public map: EntityToTableMap, public data: ModifierData, public fromRelation?: boolean) {
    }

    get limit() {
        return this.data?.limit
    }

    get offset() {
        return this.data?.offset
    }

    get orderBy() {
        return Object.entries(this.data?.orderBy || {}).map(([k, v]) => {
            return {
                attribute: k,
                recordName: this.recordName,
                order: v
            }
        })
    }

    /**
     * 构建 xToOne 查询树
     * 用于确保 ORDER BY 中引用的关联字段会触发相应的 JOIN
     */
    get xToOneQueryTree() {
        const result = new RecordQueryTree(this.recordName, this.map)
        
        // 遍历 orderBy 中的所有字段
        Object.keys(this.data?.orderBy || {}).forEach(key => {
            // 解析路径（如 'leader.age'）
            const pathParts = key.split('.')
            
            // 如果只有一个部分，说明是当前实体的字段，不需要 JOIN
            if (pathParts.length === 1) {
                result.addField([key])
                return
            }
            
            // CAUTION orderBy 路径只允许 x:1 关系段。x:n 段（如 'posts.title'）在 SQL 层是
            //  LEFT JOIN 扇出后按匹配行排序再去重——排序语义未定义（近似"按每宿主最小关联值"，
            //  但不保证），且与 limit/offset 的 post-pagination 交互后结果更不可预测。
            //  fail-fast 并指引显式表达（computed 属性做聚合，或在应用层排序）。
            for (let i = 1; i < pathParts.length; i++) {
                const info = this.map.getInfoByPath([this.recordName, ...pathParts.slice(0, i)])
                if (info?.isRecord && info.isXToMany) {
                    throw new Error(
                        `orderBy path "${key}" traverses the x:n relation "${pathParts.slice(0, i).join('.')}" — ` +
                        `ordering by a to-many path has no defined semantics (which related row should represent the record?). ` +
                        `Order by an aggregated computed property instead, or sort in application code.`
                    )
                }
                // CAUTION filtered relation 属性段（r31）：orderBy 的路径解析不经过 AttributeQuery
                //  的 base 重写，filtered link 无物理表——继续编译会生成引用不存在别名/列的 SQL
                //  （"no such column: REL_….undefined" 这类与用户写法脱节的裸错误）。且带谓词的
                //  排序语义（谓词不命中按 NULL 排）尚未实现。fail-fast 指引用 base 属性名。
                if (info?.isRecord && (info as { isLinkFiltered?: () => boolean }).isLinkFiltered?.()) {
                    const baseAttr = (info as unknown as { getBaseAttributeInfo: () => { attributeName: string } }).getBaseAttributeInfo().attributeName
                    throw new Error(
                        `orderBy path "${key}" traverses the filtered relation attribute "${pathParts.slice(0, i).join('.')}" — ` +
                        `ordering through a filtered relation is not supported yet (its predicate cannot be applied to a sort key). ` +
                        `Order by the base attribute path instead (e.g. "${[...pathParts.slice(0, i - 1), baseAttr, ...pathParts.slice(i)].join('.')}").`
                    )
                }
            }
            
            // 如果有多个部分，说明需要 JOIN 关联表
            // 添加到查询树中，确保会生成 JOIN
            result.addField(pathParts)
        })
        
        return result
    }
}