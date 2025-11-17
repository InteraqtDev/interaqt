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
            
            // 如果有多个部分，说明需要 JOIN 关联表
            // 最后一个是属性名，前面的是关系路径
            const relationPath = pathParts.slice(0, -1)
            
            // 添加到查询树中，确保会生成 JOIN
            result.addField(pathParts)
        })
        
        return result
    }
}