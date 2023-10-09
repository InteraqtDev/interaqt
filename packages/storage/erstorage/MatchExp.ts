import {BoolExp} from "../../shared/BoolExp";
import {EntityToTableMap} from "./EntityToTableMap";
import {assert, getByPath, setByPath} from "../util";

import {RecordQueryTree} from "./RecordQuery.ts";

export type MatchAtom = { key: string, value: [string, any], isReferenceValue?: boolean }
export type MatchExpressionData = BoolExp<MatchAtom>
export type FieldMatchAtom = MatchAtom & {
    isInnerQuery?: boolean,
    //  value 类型的
    fieldName?: [string, string],
    fieldValue?: string,
    // entity 类型的
    namePath?: string[],
    isFunctionMatch?: boolean,
    tableAlias?: string,

}

export class MatchExp {
    public static atom(value: MatchAtom) {
        return BoolExp.atom<MatchAtom>(value)
    }

    public entityQueryTree: RecordQueryTree

    constructor(public entityName: string, public map: EntityToTableMap, public data?: MatchExpressionData, public contextRootEntity?: string, public fromRelation?: boolean) {
        this.entityQueryTree = new RecordQueryTree(this.entityName, this.map)
        if (this.data) {
            assert(this.data instanceof BoolExp, `match data is not a BoolExpression instance, you passed: ${this.data}`)
            this.buildEntityQueryTree(this.data, this.entityQueryTree)
        }
    }

    buildEntityQueryTree(matchData: MatchExpressionData, entityQueryTree: RecordQueryTree) {
        if (matchData.isExpression()) {
            if (matchData.left) {
                this.buildEntityQueryTree(matchData.left, entityQueryTree)
            }

            if (matchData.right) {
                this.buildEntityQueryTree(matchData.right, entityQueryTree)
            }
        } else {
            // variable
            const matchAttributePath = (matchData.data.key as string).split('.')
            const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))

            // value 的情况不用管
            //  CAUTION 还有最后路径是 entity 但是  match 值是 EXIST 的不用管，因为会生成 exist 子句。只不过这里也不用特别处理，join 的表没用到会自动数据库忽略。
            if (!(matchAttributePath.length === 1 && attributeInfo.isValue)) {
                if (attributeInfo.isRecord) {
                    entityQueryTree.addRecord(matchAttributePath)
                } else {
                    // 最后一个是 attribute，所以不在 entityQueryTree 上。
                    entityQueryTree.addField(matchAttributePath)
                }
            }
        }
    }


    getFinalFieldName(matchAttributePath: string[]) {
        const namePath = [this.entityName].concat(matchAttributePath.slice(0, -1))
        return this.map.getTableAliasAndFieldName(namePath, matchAttributePath.at(-1)!).slice(0, 2)
    }

    getReferenceFieldValue(valueStr: string) {
        const matchAttributePath = valueStr.split('.')
        const [tableAlias, rawFieldName] = this.map.getTableAliasAndFieldName(
            [this.contextRootEntity || this.entityName].concat(matchAttributePath.slice(0, -1)),
            matchAttributePath.at(-1)!
        )
        return `${tableAlias}.${rawFieldName}`
    }

    getFinalFieldValue(isReferenceValue: boolean, value: [string, any]) {
        let fieldValue
        const simpleOp = ['=', '>', '<', '<=', '>=', 'like', 'not']

        if (simpleOp.includes(value[0])) {
            fieldValue = `${value[0]} ${isReferenceValue ? this.getReferenceFieldValue(value[1]) : JSON.stringify(value[1])}`
        } else if (value[0].toLowerCase() === 'in') {
            assert(!isReferenceValue, 'reference value cannot use IN to match')
            fieldValue = `IN (${value[1].map((x: any) => JSON.stringify(x)).join(',')})`
        } else if (value[0].toLowerCase() === 'between') {
            fieldValue = `BETWEEN ${isReferenceValue ? this.getReferenceFieldValue(value[1][0]) : JSON.stringify(value[1][0])} AND ${isReferenceValue ? this.getReferenceFieldValue(value[1][1]) : JSON.stringify(value[1][1])}]`
        } else {
            assert(false, `unknown value expression ${JSON.stringify(value)}`)
        }

        return fieldValue
    }

    buildFieldMatchExpression(): BoolExp<FieldMatchAtom> | null {
        if (!this.data) return null
        // 1. 所有 key 要 build 成 field
        // 2. x:n 关系中的 EXIST 要增加查询范围限制，要把 value 中对上层引用也 build 成 field。
        return this.data.map((exp: MatchExpressionData) => {
            const matchAttributePath = (exp.data.key as string).split('.')
            const attributeInfo = this.map.getInfoByPath([this.entityName].concat(matchAttributePath))

            // 如果结尾是 value
            // 如果极为是 entity，那么后面匹配条件目前只能支持 EXIST。
            //  CAUTION 针对关联实体的属性匹配，到这里已经被拍平了，所以结尾是  entity 的情况必定都是函数匹配。
            if (attributeInfo.isValue) {
                return {
                    ...exp.data,
                    fieldName: this.getFinalFieldName(matchAttributePath),
                    fieldValue: this.getFinalFieldValue(exp.data.isReferenceValue!, exp.data.value)
                }

            } else {
                // entity
                const namePath = [this.entityName].concat(matchAttributePath)
                const {alias: tableAlias} = this.map.getTableAndAliasStack(namePath).at(-1)!

                // CAUTION 函数匹配的情况不管了，因为可能未来涉及到使用 cursor 实现更强的功能，这就涉及到查询计划的修改了。统统扔到上层去做。
                //  注意，子查询中也可能对上层的引用，这个也放到上层好像能力有点重叠了。
                return {
                    ...exp.data,
                    namePath,
                    isFunctionMatch: true,
                    tableAlias
                }
            }
        })

    }

    and(condition: MatchAtom): MatchExp {
        return new MatchExp(this.entityName, this.map, this.data ? this.data.and(condition) : BoolExp.atom<MatchAtom>(condition), this.contextRootEntity)
    }
}